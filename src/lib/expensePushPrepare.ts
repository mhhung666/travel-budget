import { mongo } from 'mongoose';
import { expenseDeliveryEventSchema } from './expenseDeliveryEvent';
import type { ExpensePushExecutorDependencies } from './expensePushExecutor';
import { sendExpensePushDevice, type ExpensePushTransportInput } from './expensePushTransport';
import { buildPushPayload } from './webpush';
import { defaultLocale } from '@/i18n/routing';

interface PrepareOptions {
  /** Explicit server configuration; null disables delivery without querying the database. */
  config: { vapidDetails: ExpensePushTransportInput['vapidDetails']; appUrl: string | null } | null;
  buildPayload?: typeof buildPushPayload;
  sendDevice?: typeof sendExpensePushDevice;
}

/**
 * Dormant adapter bound to one job/lease. Preparation is read-only and never opens a connection.
 * Executor must re-read lease/checkpoints after prepare and immediately invoke the one-shot sender.
 * Reads are not locks: membership/ownership may still change between the final query and HTTP.
 */
export function createExpensePushPrepare(
  db: mongo.Db,
  expenseId: mongo.ObjectId,
  token: string,
  options: PrepareOptions
): ExpensePushExecutorDependencies['prepare'] {
  const buildPayload = options.buildPayload ?? buildPushPayload;
  const sendDevice = options.sendDevice ?? sendExpensePushDevice;
  // Bound both server execution and driver operation time; no transaction spans external HTTP.
  const queryOptions = { maxTimeMS: 2_000, timeoutMS: 2_000, readPreference: 'primary' as const };
  return async (subscriptionId) => {
    if (!/^[a-f0-9]{24}$/.test(subscriptionId)) throw new Error('Invalid subscription ID');
    const config = options.config;
    if (!config) return { status: 'disabled' };
    const expense = await db.collection('expenses').findOne(
      {
        _id: expenseId,
        'expenseDelivery.status': 'leased',
        'expenseDelivery.token': token,
        'expenseDelivery.recordsPersistedAt': { $type: 'date' },
        $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
      },
      {
        ...queryOptions,
        projection: {
          trip: 1,
          createdBy: 1,
          expenseDeliveryEvent: 1,
          'expenseDelivery.recordRecipientIds': 1,
        },
      }
    );
    if (!expense) return { status: 'stop' };
    const event = expenseDeliveryEventSchema.parse(expense.expenseDeliveryEvent);
    if (
      event.expenseId !== expenseId.toHexString() ||
      event.tripId !== expense.trip?.toString() ||
      event.actorId !== expense.createdBy?.toString()
    )
      throw new Error('Expense event ownership mismatch');
    const recipients: unknown = expense.expenseDelivery?.recordRecipientIds;
    if (
      !Array.isArray(recipients) ||
      recipients.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))
    )
      throw new Error('Invalid persisted expense recipients');

    const trip = await db
      .collection('trips')
      .findOne(
        { _id: new mongo.ObjectId(event.tripId), expenseDeliveryDeleting: { $ne: true } },
        { ...queryOptions, projection: { 'members.user': 1 } }
      );
    if (!trip) return { status: 'stop' };
    const currentMembers = new Set(
      (trip.members as { user: mongo.ObjectId }[]).map((member) => member.user.toHexString())
    );
    const firstRecipients = new Set(recipients);
    const eligible = event.memberIds.filter(
      (id) => id !== event.actorId && firstRecipients.has(id) && currentMembers.has(id)
    );
    if (!eligible.length) return { status: 'skip' };
    const subscription = await db.collection('pushsubscriptions').findOne(
      {
        _id: new mongo.ObjectId(subscriptionId),
        user: { $in: eligible.map((id) => new mongo.ObjectId(id)) },
      },
      { ...queryOptions, projection: { user: 1, endpoint: 1, keys: 1 } }
    );
    if (!subscription) return { status: 'skip' };
    if (
      [subscription.endpoint, subscription.keys?.p256dh, subscription.keys?.auth].some(
        (value) => typeof value !== 'string' || value.length === 0
      )
    )
      throw new Error('Invalid push subscription');
    const user = await db
      .collection('users')
      .findOne(
        { _id: subscription.user, isVirtual: { $ne: true } },
        { ...queryOptions, projection: { locale: 1 } }
      );
    if (!user) return { status: 'skip' };
    const payload = await buildPayload({
      type: 'expense_added',
      locale: user.locale ?? defaultLocale,
      actorName: event.actorName,
      tripHashCode: event.tripHashCode,
      tripName: event.tripName,
      meta: { expense_id: event.expenseId, description: event.description, amount: event.amount },
      appUrl: config.appUrl?.replace(/\/+$/, '') || null,
    });
    // Capture primitive values once for both HTTP and compare-and-delete, never a mutable DB object.
    const original = {
      _id: new mongo.ObjectId(subscriptionId),
      user: new mongo.ObjectId(subscription.user.toHexString()),
      endpoint: subscription.endpoint as string,
      'keys.p256dh': subscription.keys.p256dh as string,
      'keys.auth': subscription.keys.auth as string,
    };
    let sent = false;
    let expired = false;
    let cleanupAttempted = false;
    return {
      status: 'ready',
      async send() {
        if (sent) throw new Error('Prepared expense push already used');
        sent = true;
        // No cleanup before checkpoint: expired remains terminal even when later cleanup fails.
        const outcome = await sendDevice({
          subscription: {
            endpoint: original.endpoint,
            keys: { p256dh: original['keys.p256dh'], auth: original['keys.auth'] },
          },
          payload,
          vapidDetails: config.vapidDetails,
        });
        expired = outcome === 'expired';
        return outcome;
      },
      async cleanupExpired() {
        // Caller must first confirm the persisted expired checkpoint; never call during prepare/send.
        if (!expired || cleanupAttempted) return;
        cleanupAttempted = true;
        await db.collection('pushsubscriptions').deleteOne(original, {
          maxTimeMS: 2_000,
          timeoutMS: 2_000,
          collation: { locale: 'simple' },
        });
      },
    };
  };
}
