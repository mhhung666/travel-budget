// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  begin: vi.fn(),
  read: vi.fn(),
  finish: vi.fn(),
  head: vi.fn(),
  sign: vi.fn(),
  photo: vi.fn(),
  after: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: '507f191e810c19729de860ea' }) }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.membership }));
vi.mock('@/lib/photoUploadJobs', () => ({
  beginPhotoUploadJob: mocks.begin,
  readPhotoUploadJob: mocks.read,
  finalizePhotoUploadJob: mocks.finish,
}));
vi.mock('@/lib/storage', () => ({
  headObject: mocks.head,
  presignPut: mocks.sign,
  presignGetStable: vi.fn().mockResolvedValue('signed'),
}));
vi.mock('@/models', () => ({
  Photo: {
    findOne: (...args: unknown[]) => {
      mocks.photo(...args);
      return {
        lean: async () => ({
          _id: new mongo.ObjectId(),
          trip: new mongo.ObjectId(),
          key: 'display',
          thumbKey: 'thumb',
          contentType: 'image/jpeg',
          size: 20,
          uploadedBy: new mongo.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        select: () => ({ lean: async () => null }),
      };
    },
  },
  Trip: {},
}));
vi.mock('@/lib/photoSanitize', () => ({ ensureSanitizedPhotoCopy: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import {
  beginPhotoUpload,
  finishPhotoUpload,
  findDuplicatePhoto,
} from '@/actions/photoUpload.actions';
const tripId = '507f1f77bcf86cd799439011';
const uploadId = 'e6c027f1-f74b-4d31-99f3-968859d73c0e';
const request = {
  uploadId,
  sourceHash: 'a'.repeat(64),
  sourceSize: 100,
  displaySize: 20,
  thumbSize: 10,
  item: { key: 'ignored', thumb_key: 'ignored' },
};
const pending = () => ({
  status: 'pending',
  job: {
    key: 'display',
    thumbKey: 'thumb',
    displaySize: 20,
    thumbSize: 10,
    expiresAt: new Date(Date.now() + 86400000),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ tripId });
  mocks.begin.mockResolvedValue(pending());
  mocks.read.mockResolvedValue(pending());
  mocks.finish.mockResolvedValue({ status: 'saved', photoId: new mongo.ObjectId() });
  mocks.head.mockImplementation(async (_bucket, key) =>
    key === 'display'
      ? { size: 20, contentType: 'image/jpeg' }
      : { size: 10, contentType: 'image/webp' }
  );
  mocks.sign.mockResolvedValue('signed-put');
});
describe('photo upload actions', () => {
  it('authorizes every phase and rejects invalid hashes / operation IDs before allocating', async () => {
    expect((await beginPhotoUpload(tripId, { ...request, sourceHash: '../secret' })).success).toBe(
      false
    );
    expect((await finishPhotoUpload(tripId, '../secret')).success).toBe(false);
    expect(mocks.begin).not.toHaveBeenCalled();
    mocks.membership.mockResolvedValue(null);
    expect((await beginPhotoUpload(tripId, request)).success).toBe(false);
    expect((await finishPhotoUpload(tripId, uploadId)).success).toBe(false);
    expect((await findDuplicatePhoto(tripId, request.sourceHash)).success).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.photo).not.toHaveBeenCalled();
  });
  it('records the job before signing and signs only the missing half', async () => {
    mocks.head.mockImplementation(async (_bucket, key) =>
      key === 'display' ? { size: 20, contentType: 'image/jpeg' } : null
    );
    expect(await beginPhotoUpload(tripId, request)).toEqual({
      success: true,
      data: { status: 'pending', displayUrl: undefined, thumbUrl: 'signed-put' },
    });
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledWith('receipts', 'thumb', 'image/webp');
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sign.mock.invocationCallOrder[0]
    );
  });
  it('does not issue any URL if recording the job failed', async () => {
    mocks.begin.mockRejectedValueOnce(Error('DB offline'));
    expect((await beginPhotoUpload(tripId, request)).success).toBe(false);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('rejects transient HEAD failures instead of overwriting an uncertain object', async () => {
    mocks.head.mockRejectedValueOnce(Error('R2 temporarily unavailable'));
    expect((await beginPhotoUpload(tripId, request)).success).toBe(false);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.head).toHaveBeenCalledWith('receipts', 'display', { strict: true });
  });
  it.each([
    null,
    { size: 0, contentType: 'image/jpeg' },
    { size: 21, contentType: 'image/jpeg' },
    { size: 20, contentType: 'image/png' },
  ])('does not finalize missing or mismatched display metadata: %s', async (display) => {
    mocks.head.mockImplementation(async (_bucket, key) =>
      key === 'display' ? display : { size: 10, contentType: 'image/webp' }
    );
    expect(await finishPhotoUpload(tripId, uploadId)).toEqual({
      success: true,
      data: { status: 'pending' },
    });
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('returns a committed DTO without re-uploading or rechecking R2, and defers public sanitization', async () => {
    mocks.read.mockResolvedValueOnce({ status: 'saved', photoId: new mongo.ObjectId() });
    const result = await finishPhotoUpload(tripId, uploadId);
    expect(result).toMatchObject({
      success: true,
      data: { status: 'saved', photo: { url: 'signed', thumb_url: 'signed' } },
    });
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
  it('does not sign an expired lease after delayed storage checks', async () => {
    mocks.begin.mockResolvedValueOnce({
      ...pending(),
      job: { ...pending().job, expiresAt: new Date(0) },
    });
    expect(await beginPhotoUpload(tripId, request)).toEqual({
      success: true,
      data: { status: 'expired' },
    });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
