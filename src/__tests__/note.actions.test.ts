import { describe, it, expect, vi, beforeEach } from 'vitest';

// note.actions 不需真實 DB：mock session、membership 與 Note/ItineraryDay/User model。
const getSession = vi.fn();
const getTripMembership = vi.fn();
const noteFind = vi.fn();
const noteFindOne = vi.fn();
const noteFindOneAndUpdate = vi.fn();
const noteCreate = vi.fn();
const noteDeleteOne = vi.fn();
const itineraryDayFindOneAndUpdate = vi.fn();
const userFindById = vi.fn();
const headObject = vi.fn();
const deleteObjects = vi.fn();
const presignGet = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/storage', () => ({
  headObject: (...args: unknown[]) => headObject(...args),
  deleteObjects: (...args: unknown[]) => deleteObjects(...args),
  presignGet: (...args: unknown[]) => presignGet(...args),
}));

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/models', () => ({
  Note: {
    find: (...args: unknown[]) => noteFind(...args),
    findOne: (...args: unknown[]) => noteFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => noteFindOneAndUpdate(...args),
    create: (...args: unknown[]) => noteCreate(...args),
    deleteOne: (...args: unknown[]) => noteDeleteOne(...args),
  },
  ItineraryDay: {
    findOneAndUpdate: (...args: unknown[]) => itineraryDayFindOneAndUpdate(...args),
  },
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  planNote,
  getNoteAttachmentUrl,
} from '@/actions/note.actions';

const VIEWER = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const NOTE_ID = '507f1f77bcf86cd799439012';
const DAY_ID = '507f1f77bcf86cd799439013';

/** Mongoose 的 findOne(...).select(...).lean() 鏈式呼叫。 */
function chainSelectLean(returnValue: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 find(...).sort(...).lean() 鏈式呼叫。 */
function chainSortLean(returnValue: unknown) {
  return { sort: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 findOneAndUpdate(...).lean() 鏈式呼叫。 */
function chainLean(returnValue: unknown) {
  return { lean: () => Promise.resolve(returnValue) };
}

/** 一份未規劃的 lean Note doc（toTripNoteDto 輸入形狀）。 */
function leanNote(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => NOTE_ID },
    trip: { toString: () => TRIP_ID },
    text: '想去藍瓶咖啡',
    createdBy: { toString: () => VIEWER },
    authorName: 'Alice',
    pinned: false,
    plannedAt: null,
    plannedDayNumber: null,
    createdAt: new Date('2026-06-17T10:00:00.000Z'),
    updatedAt: new Date('2026-06-17T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
});

describe('getNotes', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await getNotes(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
    expect(noteFind).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the user is not a member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await getNotes(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(noteFind).not.toHaveBeenCalled();
  });

  it('maps lean docs to DTOs', async () => {
    noteFind.mockReturnValue(chainSortLean([leanNote()]));

    const result = await getNotes(TRIP_ID);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data).toEqual([
      {
        id: NOTE_ID,
        trip_id: TRIP_ID,
        text: '想去藍瓶咖啡',
        author_id: VIEWER,
        author_name: 'Alice',
        attachments: [],
        pinned: false,
        planned_at: null,
        planned_day_number: null,
        created_at: '2026-06-17T10:00:00.000Z',
        updated_at: '2026-06-17T10:00:00.000Z',
      },
    ]);
  });
});

describe('createNote', () => {
  it('returns VALIDATION_ERROR for empty text and never calls create', async () => {
    const result = await createNote(TRIP_ID, { text: '   ' });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR when the text exceeds 500 chars', async () => {
    const result = await createNote(TRIP_ID, { text: 'a'.repeat(501) });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('creates the note with a denormalized author name', async () => {
    userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));
    noteCreate.mockResolvedValue({ toObject: () => leanNote() });

    const result = await createNote(TRIP_ID, { text: '想去藍瓶咖啡' });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.author_name).toBe('Alice');

    expect(noteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: TRIP_ID,
        text: '想去藍瓶咖啡',
        createdBy: VIEWER,
        authorName: 'Alice',
      })
    );
  });
});

describe('updateNote', () => {
  it('returns VALIDATION_ERROR when no updatable field is present', async () => {
    const result = await updateNote(TRIP_ID, NOTE_ID, {});

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(noteFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the note does not belong to this trip', async () => {
    noteFindOneAndUpdate.mockReturnValue(chainLean(null));

    const result = await updateNote(TRIP_ID, NOTE_ID, { pinned: true });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('updates pinned only, without touching text', async () => {
    noteFindOneAndUpdate.mockReturnValue(chainLean(leanNote({ pinned: true })));

    const result = await updateNote(TRIP_ID, NOTE_ID, { pinned: true });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.pinned).toBe(true);

    expect(noteFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: NOTE_ID, trip: TRIP_ID },
      { $set: { pinned: true } },
      { new: true }
    );
  });
});

describe('createNote with attachments', () => {
  const NOTE_KEY = `notes/${TRIP_ID}/photo.webp`;

  it('verifies a new attachment key via headObject and persists it', async () => {
    userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));
    headObject.mockResolvedValue({ size: 2048, contentType: 'image/webp' });
    noteCreate.mockResolvedValue({
      toObject: () =>
        leanNote({ attachments: [{ key: NOTE_KEY, contentType: 'image/webp', size: 2048 }] }),
    });

    const result = await createNote(TRIP_ID, {
      text: '想去藍瓶咖啡',
      attachments: [{ key: NOTE_KEY, content_type: 'image/webp', size: 2048 }],
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(headObject).toHaveBeenCalledWith('receipts', NOTE_KEY);
    expect(noteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ key: NOTE_KEY, contentType: 'image/webp', size: 2048 }),
        ],
      })
    );
    expect(result.data.attachments).toEqual([
      { key: NOTE_KEY, content_type: 'image/webp', size: 2048 },
    ]);
  });

  it('rejects an attachment key that belongs to another trip', async () => {
    userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));

    const result = await createNote(TRIP_ID, {
      text: '想去藍瓶咖啡',
      attachments: [{ key: 'notes/otherTrip/photo.webp', content_type: 'image/webp', size: 2048 }],
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(headObject).not.toHaveBeenCalled();
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it('rejects when the uploaded object is larger than the cap', async () => {
    userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));
    headObject.mockResolvedValue({ size: 99 * 1024 * 1024, contentType: 'image/webp' });

    const result = await createNote(TRIP_ID, {
      text: '想去藍瓶咖啡',
      attachments: [{ key: NOTE_KEY, content_type: 'image/webp', size: 2048 }],
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(noteCreate).not.toHaveBeenCalled();
  });
});

describe('updateNote attachments', () => {
  const OLD_KEY = `notes/${TRIP_ID}/old.webp`;
  const NEW_KEY = `notes/${TRIP_ID}/new.webp`;

  it('keeps existing keys, verifies new ones, and deletes removed orphans', async () => {
    // 現有筆記帶一張舊照片；更新為「保留舊 + 新增一張」外加移除另一張孤兒。
    noteFindOne.mockReturnValue(
      chainSelectLean({
        attachments: [
          {
            key: OLD_KEY,
            contentType: 'image/webp',
            size: 100,
            uploadedBy: VIEWER,
            uploadedAt: new Date(),
          },
          {
            key: `notes/${TRIP_ID}/gone.webp`,
            contentType: 'image/webp',
            size: 50,
            uploadedBy: VIEWER,
            uploadedAt: new Date(),
          },
        ],
      })
    );
    headObject.mockResolvedValue({ size: 200, contentType: 'image/webp' });
    deleteObjects.mockResolvedValue(undefined);
    noteFindOneAndUpdate.mockReturnValue(chainLean(leanNote()));

    const result = await updateNote(TRIP_ID, NOTE_ID, {
      attachments: [
        { key: OLD_KEY, content_type: 'image/webp', size: 100 },
        { key: NEW_KEY, content_type: 'image/webp', size: 200 },
      ],
    });

    expect(result.success).toBe(true);
    // 只對新 key 打 headObject（舊 key 沿用）
    expect(headObject).toHaveBeenCalledTimes(1);
    expect(headObject).toHaveBeenCalledWith('receipts', NEW_KEY);
    // 被移除的孤兒照片走 best-effort 刪除
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [`notes/${TRIP_ID}/gone.webp`]);
  });
});

describe('deleteNote', () => {
  it('scopes the delete to the trip', async () => {
    noteFindOne.mockReturnValue(chainSelectLean(leanNote()));
    noteDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await deleteNote(TRIP_ID, NOTE_ID);

    expect(result.success).toBe(true);
    expect(noteDeleteOne).toHaveBeenCalledWith({ _id: NOTE_ID, trip: TRIP_ID });
  });

  it('best-effort deletes attachment objects from R2', async () => {
    const key = `notes/${TRIP_ID}/photo.webp`;
    noteFindOne.mockReturnValue(chainSelectLean({ attachments: [{ key }] }));
    noteDeleteOne.mockResolvedValue({ deletedCount: 1 });
    deleteObjects.mockResolvedValue(undefined);

    const result = await deleteNote(TRIP_ID, NOTE_ID);

    expect(result.success).toBe(true);
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [key]);
  });
});

describe('getNoteAttachmentUrl', () => {
  it('signs a short-lived GET for a key in this trip', async () => {
    presignGet.mockResolvedValue('https://signed.example/notes');

    const result = await getNoteAttachmentUrl(TRIP_ID, `notes/${TRIP_ID}/photo.webp`);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.url).toBe('https://signed.example/notes');
    expect(presignGet).toHaveBeenCalledWith('receipts', `notes/${TRIP_ID}/photo.webp`);
  });

  it('rejects a key from another trip without signing', async () => {
    const result = await getNoteAttachmentUrl(TRIP_ID, 'notes/otherTrip/photo.webp');

    expect(result.success).toBe(false);
    expect(presignGet).not.toHaveBeenCalled();
  });
});

describe('planNote', () => {
  it('returns NOT_FOUND when the note does not belong to this trip', async () => {
    noteFindOne.mockReturnValue(chainSelectLean(null));

    const result = await planNote(TRIP_ID, NOTE_ID, { day_id: DAY_ID });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(itineraryDayFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a note that is already planned (no duplicate activity)', async () => {
    noteFindOne.mockReturnValue(
      chainSelectLean({ text: '想去藍瓶咖啡', plannedAt: new Date('2026-06-18T00:00:00.000Z') })
    );

    const result = await planNote(TRIP_ID, NOTE_ID, { day_id: DAY_ID });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(itineraryDayFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the day does not belong to this trip', async () => {
    noteFindOne.mockReturnValue(chainSelectLean({ text: '想去藍瓶咖啡', plannedAt: null }));
    itineraryDayFindOneAndUpdate.mockReturnValue({ select: () => Promise.resolve(null) });

    const result = await planNote(TRIP_ID, NOTE_ID, { day_id: DAY_ID });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(noteFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('pushes the activity onto the day and marks the note planned', async () => {
    noteFindOne.mockReturnValue(chainSelectLean({ text: '想去藍瓶咖啡', plannedAt: null }));
    itineraryDayFindOneAndUpdate.mockReturnValue({
      select: () => Promise.resolve({ dayNumber: 3 }),
    });
    noteFindOneAndUpdate.mockReturnValue(
      chainLean(leanNote({ plannedAt: new Date('2026-06-18T00:00:00.000Z'), plannedDayNumber: 3 }))
    );

    const result = await planNote(TRIP_ID, NOTE_ID, { day_id: DAY_ID });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.planned_day_number).toBe(3);
    expect(result.data.planned_at).toBe('2026-06-18T00:00:00.000Z');

    // 單行短筆記：全文即標題，活動備註留空
    expect(itineraryDayFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: DAY_ID, trip: TRIP_ID },
      {
        $push: {
          activities: {
            time: null,
            endTime: null,
            title: '想去藍瓶咖啡',
            type: 'other',
            location: null,
            note: '',
            confirmationCode: '',
            attachments: [],
          },
        },
      }
    );

    expect(noteFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: NOTE_ID, trip: TRIP_ID },
      { $set: expect.objectContaining({ plannedDayNumber: 3, plannedAt: expect.any(Date) }) },
      { new: true }
    );
  });

  it('truncates a long first line into the title and keeps the full text in the activity note', async () => {
    const longText = `${'あ'.repeat(120)}\n二行目`;
    noteFindOne.mockReturnValue(chainSelectLean({ text: longText, plannedAt: null }));
    itineraryDayFindOneAndUpdate.mockReturnValue({
      select: () => Promise.resolve({ dayNumber: 1 }),
    });
    noteFindOneAndUpdate.mockReturnValue(
      chainLean(leanNote({ plannedAt: new Date(), plannedDayNumber: 1 }))
    );

    const result = await planNote(TRIP_ID, NOTE_ID, { day_id: DAY_ID });

    expect(result.success).toBe(true);
    const pushArg = itineraryDayFindOneAndUpdate.mock.calls[0][1] as {
      $push: { activities: { title: string; note: string } };
    };
    expect(pushArg.$push.activities.title).toBe('あ'.repeat(100));
    expect(pushArg.$push.activities.note).toBe(longText);
  });
});
