import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
const { ObjectId } = mongoose.mongo;
import {
  activityDeletionPreviewSchema,
  activityDeletionStateSchema,
} from '@travel-budget/contracts';

/** Receives only the disposable local verifier's DB/client; no remote configuration. */
export async function verifyItineraryBatchDelete({ db, request, owner, member }) {
  const trip = new ObjectId(),
    dayId = new ObjectId();
  const activities = Array.from({ length: 3 }, (_, i) => ({
    _id: new ObjectId(),
    revision: 1,
    title: 'Same title',
    time: `0${i + 7}:00`,
    type: 'food',
    note: 'private note',
    confirmationCode: 'private booking',
    attachments: [],
  }));
  const now = new Date();
  await db.collection('trips').insertOne({
    _id: trip,
    name: 'TEST BD1',
    baseCurrency: 'JPY',
    startDate: new Date('2028-02-28'),
    endDate: new Date('2028-03-01'),
    hashCode: randomUUID().replaceAll('-', '').slice(0, 8),
    members: [
      { user: new ObjectId(owner.user.id), role: 'admin' },
      { user: new ObjectId(member.user.id), role: 'member' },
    ],
    expenseDeliveryFence: 0,
  });
  await db.collection('itinerarydays').insertOne({
    _id: dayId,
    trip,
    dayNumber: 2,
    revision: 1,
    title: 'Leap day',
    content: 'Keep day',
    activities,
    createdAt: now,
    updatedAt: now,
  });
  const path = `/trips/${trip}/itinerary/activity-deletions`;
  const selection = {
    dayId: dayId.toString(),
    targets: activities.map((a) => ({
      activityId: a._id.toString(),
      expectedRevision: a.revision,
    })),
  };
  try {
    await request(`${path}/preview`, { body: selection, status: 401 });
    await request(`${path}/preview`, { token: member.accessToken, body: selection, status: 403 });
    const p = (
      await request(`${path}/preview`, {
        token: owner.accessToken,
        body: selection,
        schema: activityDeletionPreviewSchema,
      })
    ).data;
    assert.equal(p.date, '2028-02-29');
    assert.equal(p.targets.length, 3);
    assert(!JSON.stringify(p).includes('private'));
    assert.equal((await db.collection('trips').findOne({ _id: trip })).expenseDeliveryFence, 0);
    const input = {
      ...selection,
      client_request_id: randomUUID(),
      expectedContextRevision: p.contextRevision,
    };
    // Intentionally ignore the first HTTP response: recovery must use the original UUID.
    await request(path, {
      token: owner.accessToken,
      body: input,
      schema: activityDeletionStateSchema,
    });
    const recovered = (
      await request(`${path}/${input.client_request_id}`, {
        token: owner.accessToken,
        schema: activityDeletionStateSchema,
      })
    ).data;
    assert.equal(recovered.status, 'committed');
    assert.equal(recovered.result.count, 3);
    const replay = (
      await request(path, {
        token: owner.accessToken,
        body: { ...input, targets: [...input.targets].reverse() },
        schema: activityDeletionStateSchema,
      })
    ).data;
    assert.deepEqual(replay, recovered);
    assert.deepEqual((await db.collection('itinerarydays').findOne({ _id: dayId })).activities, []);
    assert.equal((await db.collection('itinerarydays').findOne({ _id: dayId })).revision, 2);
    assert.equal(await db.collection('itinerarymutationrequests').countDocuments({ trip }), 1);
    await request(path, {
      token: owner.accessToken,
      body: { ...input, targets: input.targets.slice(1) },
      status: 409,
    });
    const missing = (
      await request(`${path}/${randomUUID()}`, {
        token: owner.accessToken,
        schema: activityDeletionStateSchema,
      })
    ).data;
    assert.equal(missing.status, 'not_found');
    await db
      .collection('trips')
      .updateOne(
        { _id: trip, 'members.user': new ObjectId(owner.user.id) },
        { $set: { 'members.$.role': 'member' } }
      );
    await request(`${path}/${input.client_request_id}`, { token: owner.accessToken, status: 403 });
    assert.equal(await db.collection('itinerarymutationrequests').countDocuments({ trip }), 1);
    console.log(
      'PASS BD1 real HTTP: admin-only preview, lost-response UUID recovery, atomic batch, replay, empty day and lookup revocation'
    );
  } finally {
    await db.collection('itinerarymutationrequests').deleteMany({ trip });
    await db.collection('itinerarydays').deleteMany({ trip });
    await db.collection('trips').deleteOne({ _id: trip });
  }
}
