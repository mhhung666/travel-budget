// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripPhoto } from '@/types';
const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  finish: vi.fn(),
  duplicate: vi.fn(),
  compress: vi.fn(),
  exif: vi.fn(),
}));
vi.mock('@/actions/photoUpload.actions', () => ({
  beginPhotoUpload: mocks.begin,
  finishPhotoUpload: mocks.finish,
  findDuplicatePhoto: mocks.duplicate,
}));
vi.mock('@/lib/imageCompress', () => ({ compressImage: mocks.compress }));
vi.mock('@/lib/exif', () => ({ readPhotoExif: mocks.exif }));
import { runPhotoUploadQueue, type PhotoUploadTask } from '@/lib/photoUpload';
const photo = (id = 'photo'): TripPhoto => ({
  id,
  trip_id: 'trip',
  url: '/photo',
  thumb_url: '/thumb',
  content_type: 'image/jpeg',
  size: 2,
  width: 1,
  height: 1,
  taken_at: null,
  taken_local_date: null,
  taken_date_source: null,
  location: null,
  place: null,
  exif: {},
  itinerary_day_id: null,
  itinerary_day_source: null,
  caption: '',
  uploaded_by_id: 'user',
  uploaded_by_name: 'User',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
const ok = <T>(data: T) => ({ success: true, data });
const task = (name: string, bytes = name): PhotoUploadTask => ({
  id: name,
  file: new File([bytes], name, { type: 'image/jpeg' }),
  stage: 'waiting',
});
const run = (tasks: PhotoUploadTask[], extra = {}) =>
  runPhotoUploadQueue(tasks, {
    tripId: 'trip',
    signal: new AbortController().signal,
    onChange: vi.fn(),
    onPhoto: vi.fn(),
    ...extra,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  mocks.compress.mockImplementation(
    async (_file, type) =>
      new File(['compressed'], 'out', { type: type === 'photo' ? 'image/jpeg' : 'image/webp' })
  );
  mocks.exif.mockResolvedValue({});
  mocks.duplicate.mockResolvedValue(ok(null));
  mocks.begin.mockResolvedValue(
    ok({ status: 'pending', displayUrl: 'display', thumbUrl: 'thumb' })
  );
  mocks.finish.mockResolvedValue(ok({ status: 'saved', photo: photo() }));
});
describe('per-file photo queue', () => {
  it('saves a fast file before the rest of a 25-file selection finishes', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.exif.mockImplementation(async (file: File) => {
      if (file.name === 'slow') await blocked;
      return {};
    });
    const tasks = [task('slow'), ...Array.from({ length: 24 }, (_, i) => task(`file${i}`))];
    const onPhoto = vi.fn();
    const processing = run(tasks, { onPhoto });
    await vi.waitFor(() => expect(onPhoto).toHaveBeenCalledTimes(24));
    expect(tasks[0].stage).toBe('compressing');
    release();
    await processing;
    expect(tasks.every((t) => t.stage === 'saved')).toBe(true);
    expect(onPhoto).toHaveBeenCalledTimes(25);
  });
  it('isolates thrown decoding errors without losing successful files', async () => {
    mocks.exif.mockImplementation(async (file: File) => {
      if (file.name === 'broken') throw Error('decode');
      return {};
    });
    mocks.begin.mockImplementation(async (_trip, input) =>
      ok({ status: 'pending', displayUrl: input.sourceHash, thumbUrl: 'thumb' })
    );
    const tasks = [task('broken'), task('good')];
    await run(tasks);
    expect(tasks.map((t) => t.stage)).toEqual(['failed', 'saved']);
  });
  it('matches renamed identical source bytes without a second compression or PUT', async () => {
    const tasks = [task('a.jpg', 'same'), task('renamed.jpg', 'same')];
    await run(tasks);
    expect(tasks.map((t) => t.stage)).toEqual(['saved', 'duplicate']);
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.compress).toHaveBeenCalledTimes(2);
  });
  it('skips an existing photo before decoding, even when the album is full', async () => {
    mocks.duplicate.mockResolvedValue(ok(photo('existing')));
    const tasks = [task('a')];
    await run(tasks);
    expect(tasks[0].photo?.id).toBe('existing');
    expect(tasks[0].stage).toBe('duplicate');
    expect(mocks.compress).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('confirms lost PUT responses instead of failing a committed photo', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network response lost'));
    const tasks = [task('a')];
    await run(tasks);
    expect(tasks[0].stage).toBe('saved');
    expect(mocks.finish).toHaveBeenCalledTimes(1);
  });
  it('confirms a lost finalize response using the original upload ID', async () => {
    mocks.finish.mockRejectedValueOnce(Error('response lost'));
    const tasks = [task('a')];
    await run(tasks);
    expect(tasks[0].stage).toBe('saved');
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(mocks.finish.mock.calls[0]).toEqual(mocks.finish.mock.calls[1]);
  });
  it('retries only the missing thumbnail, preserving the operation ID', async () => {
    mocks.finish.mockResolvedValue(ok({ status: 'pending' }));
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === 'thumb') throw Error('offline');
      return { ok: true } as Response;
    });
    const tasks = [task('a')];
    await run(tasks);
    expect(tasks[0].stage).toBe('failed');
    const uploadId = tasks[0].uploadId;
    mocks.begin.mockResolvedValue(ok({ status: 'pending', thumbUrl: 'thumb-retry' }));
    mocks.finish
      .mockResolvedValueOnce(ok({ status: 'pending' }))
      .mockResolvedValue(ok({ status: 'saved', photo: photo() }));
    vi.mocked(fetch).mockClear();
    await run(tasks);
    expect(tasks[0].stage).toBe('saved');
    expect(tasks[0].uploadId).toBe(uploadId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('thumb-retry');
  });
  it('stops new work after capacity rejection and still accounts for every file', async () => {
    mocks.begin.mockResolvedValue(ok({ status: 'full' }));
    mocks.finish.mockResolvedValue(ok({ status: 'missing' }));
    const tasks = Array.from({ length: 12 }, (_, i) => task(String(i)));
    await run(tasks);
    expect(tasks.every((t) => t.stage === 'failed' && t.reason === 'full')).toBe(true);
    expect(mocks.begin.mock.calls.length).toBeLessThanOrEqual(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('stopping preserves already committed photos and does not start remaining files', async () => {
    const abort = new AbortController();
    const tasks = Array.from({ length: 12 }, (_, i) => task(String(i)));
    await run(tasks, { signal: abort.signal, onPhoto: () => abort.abort() });
    expect(tasks.some((t) => t.stage === 'saved')).toBe(true);
    expect(tasks.some((t) => t.stage === 'canceled')).toBe(true);
    expect(tasks.every((t) => ['saved', 'canceled'].includes(t.stage))).toBe(true);
    expect(mocks.begin.mock.calls.length).toBeLessThanOrEqual(3);
  });
  it('does not read or allocate an oversized original', async () => {
    const file = task('huge');
    Object.defineProperty(file.file, 'size', { value: 51 * 1024 * 1024 });
    await run([file]);
    expect(file.reason).toBe('too-large');
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});
