// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, expect, it, describe, vi } from 'vitest';
import { sortActivities } from '@/lib/itineraryActivities';
const auth = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: auth.userId }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));
import { mobileItinerary } from '@/lib/mobile/itinerary';
import { getItinerary } from '@/actions/itinerary.actions';
import { withLedgerV2 } from '@/lib/ledger';
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit isolated test URI and write opt-in required');
const oid = () => new mongoose.Types.ObjectId();
const actor = oid(),
  peer = oid(),
  stranger = oid(),
  trip = oid();
const location = {
  name: 'Tokyo',
  names: { zh: '東京' },
  display_name: 'Tokyo, Japan',
  lat: 35,
  lon: 139,
};
const activities = [
  { _id: oid(), title: 'Untimed', time: null, endTime: null },
  { _id: oid(), title: 'Second', time: '10:00', endTime: '11:00' },
  { _id: oid(), title: 'First', time: '08:00', endTime: null },
  { _id: oid(), title: 'Tie', time: '10:00', endTime: null },
].map((activity) => ({
  ...activity,
  revision: 0,
  type: 'transport',
  note: '多行\n原文',
  location,
  locationName: 'Station',
  confirmationCode: 'MEMBER-ONLY',
  attachments: [
    {
      key: 'itinerary/private-ticket',
      contentType: 'image/png',
      size: 12,
      uploadedBy: actor,
      uploadedAt: new Date(),
    },
  ],
}));
describe.skipIf(!uri || !allowed)('member itinerary reader on isolated MongoDB', () => {
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_itinerary_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    auth.userId = actor.toString();
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'Read test',
      baseCurrency: 'USD',
      members: [
        { user: actor, role: 'admin' },
        { user: peer, role: 'member' },
      ],
      startDate: new Date('2028-02-28'),
      endDate: new Date('2028-03-01'),
      expenseDeliveryFence: 7,
    });
    await db.collection('itinerarydays').insertMany(
      [5, 1, 3].map((n) => ({
        _id: oid(),
        trip,
        dayNumber: n,
        revision: 0,
        title: `Day ${n}`,
        content: '# Notes\n- test',
        location,
        activities: n === 1 ? activities : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  const read = (user = actor.toString()) =>
    withLedgerV2(() => mobileItinerary(user, trip.toString()));
  it('matches the Web member reader dates/content and activity ordering on a non-TWD trip', async () => {
    const native = await read();
    const web = await getItinerary(trip.toString());
    expect(web.success).toBe(true);
    if (!web.success) throw new Error('Web itinerary failed');
    expect(native.days.map((day) => day.dayNumber)).toEqual([1, 3, 5]);
    expect(native.days.map((day) => day.date)).toEqual(['2028-02-28', '2028-03-01', '2028-03-03']);
    for (const [i, day] of native.days.entries()) {
      expect(day.title).toBe(web.data[i].title);
      expect(day.content).toBe(web.data[i].content);
      expect(day.location).toEqual(web.data[i].location);
      expect(day.activities.map((a) => a.id)).toEqual(
        sortActivities(web.data[i].activities).map((a) => a.id)
      );
    }
    expect(native.days[0].activities[0]).toMatchObject({
      confirmationCode: 'MEMBER-ONLY',
      note: '多行\n原文',
      location,
    });
    expect(JSON.stringify(native)).not.toMatch(/private-ticket|attachments|uploadedBy/);
    expect(native.days[2].outsideTripRange).toBe(true);
  });
  it('allows ordinary members, rejects outsiders and shares, and never writes a delivery fence', async () => {
    await expect(read(peer.toString())).resolves.toMatchObject({ tripId: trip.toString() });
    await expect(read(stranger.toString())).rejects.toMatchObject({ status: 404 });
    await expect(
      withLedgerV2(() => mobileItinerary(actor.toString(), 'sharecode'))
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await mongoose.connection.db!.collection('trips').findOne({ _id: trip }))!
        .expenseDeliveryFence
    ).toBe(7);
    expect(await mongoose.connection.db!.collection('itinerarydays').countDocuments({ trip })).toBe(
      3
    );
  });
  it('reads unscheduled/empty itineraries without invented dates, then rejects revoked membership', async () => {
    const db = mongoose.connection.db!;
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $set: { startDate: null, endDate: null } });
    expect((await read()).days.every((day) => day.date === null)).toBe(true);
    await db.collection('itinerarydays').deleteMany({ trip });
    expect((await read()).days).toEqual([]);
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: peer } } } as never);
    await expect(read(peer.toString())).rejects.toMatchObject({ status: 404 });
  });
});
