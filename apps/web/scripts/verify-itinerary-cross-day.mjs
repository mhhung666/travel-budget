import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  itinerarySchema,
  itineraryEditContextSchema,
  itineraryWriteStateSchema,
  activityDeletionPreviewSchema,
} from '@travel-budget/contracts';
import { up } from '../migrations/20261106120000-itinerary-end-day-offset.js';

/** Only called by the disposable local HTTP verifier. No remote configuration. */
export async function verifyItineraryCrossDay({ db, request, owner, member }) {
  const { ObjectId } = mongoose.mongo;
  const trip = new ObjectId(),
    day = new ObjectId();
  const now = new Date();
  const root = `/trips/${trip}/itinerary`;
  const write = async (body) =>
    (
      await request(`${root}/requests`, {
        token: owner.accessToken,
        body,
        schema: itineraryWriteStateSchema,
      })
    ).data;
  const context = async () =>
    (
      await request(`${root}/edit-context`, {
        token: owner.accessToken,
        schema: itineraryEditContextSchema,
      })
    ).data;
  await db.collection('trips').insertOne({
    _id: trip,
    name: 'TEST CD0',
    baseCurrency: 'JPY',
    startDate: new Date('2028-02-28'),
    endDate: new Date('2028-03-02'),
    expenseDeliveryFence: 0,
    members: [
      { user: new ObjectId(owner.user.id), role: 'admin' },
      { user: new ObjectId(member.user.id), role: 'member' },
    ],
  });
  await db
    .collection('itinerarydays')
    .insertOne({
      _id: day,
      trip,
      dayNumber: 2,
      title: 'Leap day',
      content: '',
      revision: 0,
      activities: [],
      createdAt: now,
      updatedAt: now,
    });
  const activity = {
    title: 'Flight',
    type: 'flight',
    time: '22:25',
    endTime: '00:20',
    location: null,
    locationName: 'Airport',
    note: '',
    confirmationCode: 'PRIVATE',
  };
  try {
    assert.equal((await context()).capabilities.activityEndDayOffset, true);
    const legacy = {
      operation: 'activity.create',
      client_request_id: randomUUID(),
      dayId: String(day),
      activity,
    };
    const created = await write(legacy);
    assert.equal(created.status, 'committed');
    const activityId = created.result.activityId;
    let ctx = await context();
    assert.equal(ctx.days[0].activities[0].endDayOffset, null);
    const modern = {
      operation: 'activity.update',
      client_request_id: randomUUID(),
      dayId: String(day),
      activityId,
      expected_activity_revision: 0,
      activity: { ...activity, endDayOffset: 1 },
    };
    // Discard the first response, then recover and replay the original operation.
    await write(modern);
    const recovered = (
      await request(`${root}/requests/${modern.client_request_id}`, {
        token: owner.accessToken,
        schema: itineraryWriteStateSchema,
      })
    ).data;
    assert.equal(recovered.status, 'committed');
    assert.deepEqual(await write(modern), recovered);
    assert.equal(await db.collection('itinerarymutationrequests').countDocuments({ trip }), 2);
    const oldEdit = {
      ...modern,
      client_request_id: randomUUID(),
      expected_activity_revision: 1,
      activity: { ...activity, title: 'Old App label edit' },
    };
    assert.equal((await write(oldEdit)).status, 'committed');
    ctx = await context();
    assert.equal(ctx.days[0].activities[0].endDayOffset, 1);
    assert.equal(ctx.days[0].date, '2028-02-29');
    const read = (await request(root, { token: member.accessToken, schema: itinerarySchema })).data;
    assert.equal(read.days[0].activities[0].endDayOffset, 1);
    const selection = { dayId: String(day), targets: [{ activityId, expectedRevision: 2 }] };
    const preview = async (body) =>
      (
        await request(`${root}/activity-deletions/preview`, {
          token: owner.accessToken,
          body,
          schema: activityDeletionPreviewSchema,
        })
      ).data;
    assert(!Object.hasOwn((await preview(selection)).targets[0], 'endDayOffset'));
    assert.equal(
      (await preview({ ...selection, includeEndDayOffset: true })).targets[0].endDayOffset,
      1
    );
    await request(`${root}/requests`, {
      token: owner.accessToken,
      body: {
        ...modern,
        client_request_id: randomUUID(),
        expected_activity_revision: 2,
        activity: { ...activity, endDayOffset: 3651 },
      },
      status: 400,
    });
    assert.equal(await db.collection('itinerarymutationrequests').countDocuments({ trip }), 3);
    // Migration is missing-only and never resets confirmed values or changes receipts.
    await db
      .collection('itinerarydays')
      .updateOne(
        { _id: day },
        {
          $push: {
            activities: {
              _id: new ObjectId(),
              revision: 0,
              title: 'Unknown',
              type: 'other',
              time: '22:25',
              endTime: '00:20',
            },
          },
        }
      );
    const receipts = await db.collection('itinerarymutationrequests').find({ trip }).toArray();
    await up(db);
    await up(db);
    const stored = await db.collection('itinerarydays').findOne({ _id: day });
    assert.deepEqual(
      stored.activities.map((a) => a.endDayOffset),
      [1, null]
    );
    assert.deepEqual(
      await db.collection('itinerarymutationrequests').find({ trip }).toArray(),
      receipts
    );
    assert.deepEqual(await write(legacy), created);
    console.log(
      'PASS CD0 real HTTP/DB: capability, explicit/unknown dates, legacy edit preservation, lost-response UUID recovery, strict preview opt-in and missing-only migration'
    );
  } finally {
    await db.collection('itinerarymutationrequests').deleteMany({ trip });
    await db.collection('itinerarydays').deleteMany({ trip });
    await db.collection('trips').deleteOne({ _id: trip });
  }
}
