// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Trip,
  Checklist,
  Payment,
  Expense,
  Comment,
  ItineraryDay,
  Note,
  FlightRecord,
  StayRecord,
} from '@/models';
import {
  createFlightRecord,
  updateFlightRecord,
  createStayRecord,
  updateStayRecord,
} from '@/actions/collection.actions';
import { deleteTripAtomically } from '@/lib/tripDeletion';
import { createNote, updateNote, deleteNote } from '@/actions/note.actions';
import { addVirtualMember, addFriendsToTrip, updateMemberRole } from '@/actions/member.actions';
import { regenerateHashCode, joinTrip } from '@/actions/trip.actions';
import { enableAlbumShare, disableAlbumShare } from '@/actions/albumShare.actions';
import { createExpense, updateExpense, deleteExpense } from '@/actions/expense.actions';
import { createComment, deleteComment } from '@/actions/comment.actions';
import { recordPayment, deletePayment } from '@/actions/payment.actions';
import {
  createChecklist,
  createChecklistWithItems,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
} from '@/actions/checklist.actions';
import { removeTripMember } from '@/lib/memberRemoval';
import { changeMemberIdentity } from '@/lib/memberIdentity';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  notify: vi.fn(),
  activity: vi.fn(),
  head: vi.fn(),
  cleanup: vi.fn(),
  background: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  headObject: mocks.head,
  deleteObjects: mocks.cleanup,
  presignGet: vi.fn(),
}));
vi.mock('@/lib/expenseDeliveryRuntime', () => ({
  prepareExpenseBackgroundWrite: mocks.background,
  runExpenseBackgroundDelivery: vi.fn(),
}));
vi.mock('@/lib/photoSanitize', () => ({
  ensureSanitizedPhotoCopies: vi.fn(async () => undefined),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.session }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/activity', () => ({ logActivity: mocks.activity }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
const admin = new mongo.ObjectId();
const member = new mongo.ObjectId();
const real = new mongo.ObjectId();
describe.skipIf(!uri || !allowed)('trip writers against isolated replica set', () => {
  let owned = false;
  let tripId: string;
  let listId: string;
  let itemId: string;
  let expenseId: string;
  let commentId: string;
  let noteId: string;
  let flightId: string;
  let stayId: string;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_writers_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db.collection('users').insertMany([
      { _id: admin, username: 'admin', displayName: 'Admin' },
      { _id: member, username: 'virtual', displayName: 'Virtual', isVirtual: true },
      { _id: real, username: 'real', displayName: 'Real', password: 'hash', isVirtual: false },
    ]);
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.head.mockResolvedValue({ size: 100, contentType: 'image/webp' });
    mocks.cleanup.mockResolvedValue(undefined);
    mocks.background.mockResolvedValue(false);
    mocks.session.mockResolvedValue({ userId: admin.toHexString() });
    const trip = await Trip.create({
      name: 'Writers',
      hashCode: randomUUID().replaceAll('-', '').slice(0, 8),
      members: [
        { user: admin, role: 'admin' },
        { user: member, role: 'member' },
      ],
    });
    tripId = trip.id;
    flightId = (
      await FlightRecord.create({
        user: admin,
        trip: tripId,
        date: new Date(),
        datePrecision: 'day',
        airline: 'BR',
      })
    ).id;
    stayId = (
      await StayRecord.create({
        user: admin,
        trip: tripId,
        checkIn: new Date(),
        datePrecision: 'day',
        hotelName: 'Hotel',
      })
    ).id;

    noteId = (
      await Note.create({ trip: tripId, text: 'Original', createdBy: admin, authorName: 'Admin' })
    ).id;
    const expense = await Expense.create({
      trip: tripId,
      payer: member,
      amount: 100,
      originalAmount: 100,
      exchangeRate: 1,
      currency: 'TWD',
      description: 'Original',
      category: 'food',
      date: new Date(),
      splits: [{ user: member, shareAmount: 100 }],
      createdBy: admin,
    });
    expenseId = expense.id;
    const comment = await Comment.create({
      trip: tripId,
      expense: expenseId,
      author: member,
      authorName: 'Virtual',
      body: 'Hello',
    });
    commentId = comment.id;

    const list = await Checklist.create({
      trip: tripId,
      title: 'List',
      kind: 'packing',
      createdBy: admin,
      items: [{ text: 'Pack', assignee: member, doneBy: [member] }],
    });
    listId = list.id;
    itemId = list.items[0]._id!.toString();
  });
  const paymentInput = () => ({
    from_id: member.toHexString(),
    to_id: admin.toHexString(),
    amount: 100,
  });
  const expenseInput = () => ({
    payer_id: member.toHexString(),
    original_amount: 100,
    exchange_rate: 1,
    currency: 'TWD',
    description: 'New',
    category: 'food',
    date: '2026-09-01',
    splits: [{ user_id: member.toHexString(), share_amount: 100 }],
  });
  const flightInput = () => ({
    trip_id: tripId,
    date: '2026-09-01',
    date_precision: 'day' as const,
    airline: 'BR',
    flight_no: '',
    note: '',
  });
  const stayInput = () => ({
    trip_id: tripId,
    check_in: '2026-09-01',
    date_precision: 'day' as const,
    hotel_name: 'Hotel',
    city: '',
    note: '',
  });
  const writers = [
    ['flight create', () => createFlightRecord(flightInput())],
    ['flight update', () => updateFlightRecord(flightId, flightInput())],
    ['stay create', () => createStayRecord(stayInput())],
    ['stay update', () => updateStayRecord(stayId, stayInput())],
    ['note create', () => createNote(tripId, { text: 'New' })],
    ['note update', () => updateNote(tripId, noteId, { text: 'Changed' })],
    ['note delete', () => deleteNote(tripId, noteId)],
    ['virtual member', () => addVirtualMember(tripId, { display_name: 'New virtual' })],
    ['friend add', () => addFriendsToTrip(tripId, { friend_ids: [real.toHexString()] })],
    ['member role', () => updateMemberRole(tripId, member.toHexString(), 'admin')],
    ['expense create', () => createExpense(tripId, expenseInput())],
    ['expense update', () => updateExpense(tripId, expenseId, { description: 'Changed' })],
    ['expense delete', () => deleteExpense(tripId, expenseId)],
    ['comment create', () => createComment(tripId, expenseId, { body: 'New' })],
    ['comment delete', () => deleteComment(tripId, expenseId, commentId)],
    ['payment create', () => recordPayment(tripId, paymentInput())],
    ['payment delete', () => deletePayment(tripId, new mongo.ObjectId().toHexString())],
    ['checklist create', () => createChecklist(tripId, { title: 'New' })],
    [
      'checklist template',
      () => createChecklistWithItems(tripId, { title: 'New', kind: 'packing', items: ['A'] }),
    ],
    ['checklist rename', () => updateChecklist(tripId, listId, { title: 'Rename' })],
    ['checklist delete', () => deleteChecklist(tripId, listId)],
    [
      'item add',
      () => addChecklistItem(tripId, listId, { text: 'New', assignee_id: member.toHexString() }),
    ],
    ['item edit', () => updateChecklistItem(tripId, listId, itemId, { done: true })],
    ['item delete', () => removeChecklistItem(tripId, listId, itemId)],
  ] as const;
  it.each(writers)('commits %s for a current member', async (_name, write) => {
    expect(await write()).toMatchObject({ success: true });
  });
  it.each(writers)(
    'rejects %s after the actor is removed during initial authorization',
    async (_name, write) => {
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let changed = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'trips' && !changed) {
            changed = true;
            await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: admin } } });
          }
          return original.apply(this, args);
        });
      try {
        expect(await write()).toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        spy.mockRestore();
      }
      expect(mocks.notify).not.toHaveBeenCalled();
    }
  );
  it('does not reattach lifetime records after trip deletion', async () => {
    await Promise.all([
      createFlightRecord(flightInput()),
      updateStayRecord(stayId, stayInput()),
      deleteTripAtomically(mongoose.connection.db!, tripId, admin.toHexString()),
    ]);
    expect(await FlightRecord.countDocuments({ trip: tripId })).toBe(0);
    expect(await StayRecord.countDocuments({ trip: tripId })).toBe(0);
    expect(await StayRecord.findById(stayId)).not.toBeNull();
  });
  it('continues to create personal records without a trip', async () => {
    expect(await createFlightRecord({ ...flightInput(), trip_id: null })).toMatchObject({
      success: true,
      data: { trip_id: null },
    });
    expect(await createStayRecord({ ...stayInput(), trip_id: null })).toMatchObject({
      success: true,
      data: { trip_id: null },
    });
  });
  it('revokes trip codes and album sharing for a current member', async () => {
    expect(await regenerateHashCode(tripId)).toMatchObject({ success: true });
    expect(await enableAlbumShare(tripId)).toMatchObject({ success: true });
    expect(await disableAlbumShare(tripId)).toMatchObject({ success: true });
  });
  it('only joins once when two requests race and rejects deleting trips', async () => {
    mocks.session.mockResolvedValue({ userId: real.toHexString() });
    const results = await Promise.all([joinTrip(tripId), joinTrip(tripId)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await Trip.findById(tripId))!.members.filter((m) => m.user.equals(real))).toHaveLength(
      1
    );
    await Trip.updateOne(
      { _id: tripId },
      { $pull: { members: { user: real } }, $set: { expenseDeliveryDeleting: true } }
    );
    expect(await joinTrip(tripId)).toMatchObject({ success: false });
  });
  it('rolls back a newly created virtual user if adding the member fails', async () => {
    const before = await mongoose.connection.db!.collection('users').countDocuments();
    const original = mongo.Collection.prototype.updateOne;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'updateOne')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'trips') throw new Error('Injected member failure');
        return result;
      });
    try {
      expect(await addVirtualMember(tripId, { display_name: 'New' })).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    } finally {
      spy.mockRestore();
    }
    expect(await mongoose.connection.db!.collection('users').countDocuments()).toBe(before);
  });

  it('rolls back expense and comment deletion before any receipt cleanup', async () => {
    const key = `receipts/${tripId}/test.webp`;
    await Expense.updateOne(
      { _id: expenseId },
      { $set: { attachments: [{ key, contentType: 'image/webp', size: 100, uploadedBy: admin }] } }
    );
    const original = mongo.Collection.prototype.deleteMany;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'deleteMany')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'comments') throw new Error('Injected cascade failure');
        return result;
      });
    try {
      expect(await deleteExpense(tripId, expenseId)).toMatchObject({ code: 'INTERNAL_ERROR' });
    } finally {
      spy.mockRestore();
    }
    expect(await Expense.findById(expenseId)).not.toBeNull();
    expect(await Comment.findById(commentId)).not.toBeNull();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('rechecks payer membership and day references after receipt HEAD', async () => {
    const day = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 1,
      title: 'Day',
      activities: [],
    });
    mocks.head.mockImplementationOnce(async () => {
      await ItineraryDay.deleteOne({ _id: day._id });
      return { size: 100, contentType: 'image/webp' };
    });
    expect(
      await createExpense(tripId, {
        ...expenseInput(),
        itinerary_day_ids: [day.id],
        attachments: [
          { key: `receipts/${tripId}/new.webp`, content_type: 'image/webp', size: 100 },
        ],
      })
    ).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await Expense.countDocuments({ trip: tripId })).toBe(1);
  });
  it('serializes expense creation with identity conversion including outbox snapshots', async () => {
    mocks.background.mockResolvedValue(true);
    const trip = await Trip.findById(tripId).lean();
    await Promise.all([
      createExpense(tripId, expenseInput()),
      updateExpense(tripId, expenseId, { original_amount: 200 }),
      changeMemberIdentity(mongoose.connection.db!, {
        kind: 'link',
        tripId,
        virtualUserId: member.toHexString(),
        realUserId: real.toHexString(),
        passwordHash: 'hash',
        hashCode: trip!.hashCode,
      }),
    ]);
    expect(
      await Expense.countDocuments({
        trip: tripId,
        $or: [{ payer: member }, { 'splits.user': member }],
      })
    ).toBe(0);
  });
  it('does not leave comments when creation races with expense deletion', async () => {
    await Promise.all([
      createComment(tripId, expenseId, { body: 'Late' }),
      deleteExpense(tripId, expenseId),
    ]);
    expect(await Expense.findById(expenseId)).toBeNull();
    expect(await Comment.countDocuments({ expense: expenseId })).toBe(0);
  });

  it('creates and deletes payments with hash-code input', async () => {
    const trip = await Trip.findById(tripId).lean();
    const result = await recordPayment(trip!.hashCode, paymentInput());
    expect(result.success).toBe(true);
    const payment = await Payment.findOne({ trip: tripId });
    expect(payment).not.toBeNull();
    expect(await deletePayment(trip!.hashCode, payment!.id)).toMatchObject({ success: true });
    expect(await Payment.countDocuments({ trip: tripId })).toBe(0);
  });
  it('serializes a virtual identity claim with payment and assignment writers', async () => {
    const trip = await Trip.findById(tripId).lean();
    await Promise.all([
      recordPayment(tripId, paymentInput()),
      updateChecklistItem(tripId, listId, itemId, { assignee_id: member.toHexString() }),
      changeMemberIdentity(mongoose.connection.db!, {
        kind: 'link',
        tripId,
        virtualUserId: member.toHexString(),
        realUserId: real.toHexString(),
        passwordHash: 'hash',
        hashCode: trip!.hashCode,
      }),
    ]);
    expect(
      await Payment.countDocuments({ trip: tripId, $or: [{ from: member }, { to: member }] })
    ).toBe(0);
    expect(await Checklist.countDocuments({ trip: tripId, 'items.assignee': member })).toBe(0);
  });
  it('does not resurrect a removed checklist assignee or doneBy', async () => {
    await Promise.all([
      updateChecklistItem(tripId, listId, itemId, { assignee_id: member.toHexString() }),
      removeTripMember(mongoose.connection.db!, {
        tripId,
        actorId: admin.toHexString(),
        targetId: member.toHexString(),
      }),
    ]);
    const list = await Checklist.findById(listId).lean();
    expect(list!.items[0].assignee).toBeNull();
    expect(list!.items[0].doneBy).toEqual([]);
  });
  it('rolls back checklist writes when the response read fails inside the transaction', async () => {
    const original = mongo.Collection.prototype.findOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'findOne').mockImplementation(async function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'checklists') throw new Error('Injected read failure');
      return original.apply(this, args);
    });
    try {
      expect(await updateChecklist(tripId, listId, { title: 'Changed' })).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    } finally {
      spy.mockRestore();
    }
    expect((await Checklist.findById(listId))!.title).toBe('List');
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});
