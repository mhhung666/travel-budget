import { describe, it, expect, vi, beforeEach } from 'vitest';

// checklist.actions 的 per-member 勾選邏輯（doneBy）不需真實 DB：mock session/membership 與 model。
const getSession = vi.fn();
const getTripMembership = vi.fn();
const checklistFindOne = vi.fn();
const checklistUpdateOne = vi.fn();
const tripFindById = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/models', () => ({
  Checklist: {
    findOne: (...args: unknown[]) => checklistFindOne(...args),
    updateOne: (...args: unknown[]) => checklistUpdateOne(...args),
  },
  Trip: {
    findById: (...args: unknown[]) => tripFindById(...args),
  },
}));

import { updateChecklistItem } from '@/actions/checklist.actions';

const VIEWER = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const LIST_ID = '507f1f77bcf86cd799439012';
const ITEM_ID = '507f1f77bcf86cd799439013';

/** 一個既支援 .select().lean() 也支援 .populate().lean() 的 query stub，lean 依序回傳。 */
function queueFindOne(...leanResults: unknown[]) {
  const queue = [...leanResults];
  checklistFindOne.mockImplementation(() => {
    const chain = {
      select: () => chain,
      populate: () => chain,
      lean: () => Promise.resolve(queue.shift()),
    };
    return chain;
  });
}

const DTO_DOC = {
  _id: { toString: () => LIST_ID },
  trip: { toString: () => TRIP_ID },
  kind: 'packing',
  title: 'Packing',
  items: [],
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

describe('updateChecklistItem — per-member doneBy toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ userId: VIEWER });
    getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
    checklistUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it('packing + done:true → $addToSet self into doneBy', async () => {
    queueFindOne({ kind: 'packing' }, DTO_DOC);

    const res = await updateChecklistItem(TRIP_ID, LIST_ID, ITEM_ID, { done: true });
    expect(res.success).toBe(true);

    const [, update] = checklistUpdateOne.mock.calls[0];
    expect(update.$addToSet).toEqual({ 'items.$[el].doneBy': VIEWER });
    expect(update.$pull).toBeUndefined();
    expect(update.$set).toBeUndefined();
  });

  it('packing + done:false → $pull self from doneBy', async () => {
    queueFindOne({ kind: 'packing' }, DTO_DOC);

    const res = await updateChecklistItem(TRIP_ID, LIST_ID, ITEM_ID, { done: false });
    expect(res.success).toBe(true);

    const [, update] = checklistUpdateOne.mock.calls[0];
    expect(update.$pull).toEqual({ 'items.$[el].doneBy': VIEWER });
    expect(update.$addToSet).toBeUndefined();
  });

  it('shared (todo) + done:true → $set doneBy to [self]', async () => {
    queueFindOne({ kind: 'todo' }, DTO_DOC);

    const res = await updateChecklistItem(TRIP_ID, LIST_ID, ITEM_ID, { done: true });
    expect(res.success).toBe(true);

    const [, update] = checklistUpdateOne.mock.calls[0];
    expect(update.$set).toEqual({ 'items.$[el].doneBy': [VIEWER] });
    expect(update.$addToSet).toBeUndefined();
  });

  it('shared (todo) + done:false → $set doneBy to []', async () => {
    queueFindOne({ kind: 'todo' }, DTO_DOC);

    const res = await updateChecklistItem(TRIP_ID, LIST_ID, ITEM_ID, { done: false });
    expect(res.success).toBe(true);

    const [, update] = checklistUpdateOne.mock.calls[0];
    expect(update.$set).toEqual({ 'items.$[el].doneBy': [] });
  });

  it('returns NOT_FOUND when the checklist does not exist', async () => {
    queueFindOne(null);

    const res = await updateChecklistItem(TRIP_ID, LIST_ID, ITEM_ID, { done: true });
    expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(checklistUpdateOne).not.toHaveBeenCalled();
  });
});
