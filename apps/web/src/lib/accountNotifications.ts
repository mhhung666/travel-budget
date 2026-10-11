import {
  notificationLocaleSchema,
  notificationPreferencesInput,
  notificationPreferencesSchema,
} from '@travel-budget/contracts';
import { dbConnect } from '@/lib/mongodb';
import { User } from '@/models';

export class AccountNotificationsError extends Error {
  constructor(public code: 'VALIDATION_ERROR' | 'NOT_FOUND') {
    super(code);
  }
}
function toPreferences(user: { notifyByEmail?: boolean | null; locale?: string | null }) {
  const locale = notificationLocaleSchema.safeParse(user.locale);
  return notificationPreferencesSchema.parse({
    notifyByEmail: user.notifyByEmail !== false,
    locale: locale.success ? locale.data : 'zh',
  });
}
/** Actor is supplied by an authenticated adapter. No target IDs or UI locale side effects. */
export async function readAccountNotifications(actorId: string) {
  await dbConnect();
  const user = await User.findOne({ _id: actorId, isVirtual: { $ne: true } })
    .select('notifyByEmail locale')
    .lean();
  if (!user) throw new AccountNotificationsError('NOT_FOUND');
  return toPreferences(user);
}
export async function updateAccountNotifications(actorId: string, input: unknown) {
  const parsed = notificationPreferencesInput.safeParse(input);
  if (!parsed.success) throw new AccountNotificationsError('VALIDATION_ERROR');
  const update: Record<string, unknown> = {};
  if (parsed.data.notifyByEmail !== undefined) update.notifyByEmail = parsed.data.notifyByEmail;
  if (parsed.data.locale !== undefined) update.locale = parsed.data.locale;
  await dbConnect();
  const user = await User.findOneAndUpdate(
    { _id: actorId, isVirtual: { $ne: true } },
    { $set: update },
    { returnDocument: 'after' }
  )
    .select('notifyByEmail locale')
    .lean();
  if (!user) throw new AccountNotificationsError('NOT_FOUND');
  return toPreferences(user);
}
