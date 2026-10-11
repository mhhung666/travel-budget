import { accountProfileInput } from '@travel-budget/contracts';
import { dbConnect } from '@/lib/mongodb';
import { User } from '@/models';

export class AccountProfileError extends Error {
  constructor(public code: 'VALIDATION_ERROR' | 'NOT_FOUND') {
    super(code);
  }
}
/** Actor comes only from the authenticated adapter; never accept a target ID in the payload. */
export async function readAccountDetails(actorId: string) {
  await dbConnect();
  const user = await User.findOne({ _id: actorId, isVirtual: { $ne: true } })
    .select('username displayName email createdAt avatarUrl notifyByEmail')
    .lean();
  if (!user) throw new AccountProfileError('NOT_FOUND');
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    avatarUrl: user.avatarUrl ?? null,
    notifyByEmail: user.notifyByEmail !== false,
  };
}
export async function updateAccountProfile(actorId: string, input: unknown) {
  const parsed = accountProfileInput.safeParse(input);
  if (!parsed.success) throw new AccountProfileError('VALIDATION_ERROR');
  await dbConnect();
  // One atomic set returning the actual stored values; never touch credentials or other preferences.
  const user = await User.findOneAndUpdate(
    { _id: actorId, isVirtual: { $ne: true } },
    { $set: { displayName: parsed.data.displayName } },
    { returnDocument: 'after' }
  )
    .select('username displayName email')
    .lean();
  if (!user) throw new AccountProfileError('NOT_FOUND');
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
  };
}
