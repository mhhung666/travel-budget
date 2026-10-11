import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import { passwordChangeInput } from '@travel-budget/contracts';
import { accountPolicy, claimAccountLimit, type AccountContext } from './accountEntry';

export class AccountPasswordError extends Error {
  constructor(
    public code: 'INVALID_CURRENT_PASSWORD' | 'RESOURCE_CHANGED' | 'NOT_FOUND' | 'VALIDATION_ERROR'
  ) {
    super(code);
  }
}
/** One authenticated actor, rolling quota and compare-and-swap. Never stores/logs raw passwords. */
export async function changeAccountPassword(
  db: mongo.Db,
  actor: string,
  raw: unknown,
  context: AccountContext
) {
  const parsed = passwordChangeInput.safeParse(raw);
  if (!parsed.success) throw new AccountPasswordError('VALIDATION_ERROR');
  if (!/^[a-f\d]{24}$/i.test(actor)) throw new AccountPasswordError('NOT_FOUND');
  await claimAccountLimit(
    db,
    {
      ...context,
      policy: {
        ...accountPolicy,
        verify: { windowMs: 900000, maximum: 10, gapMs: 0 },
      },
    },
    'verify',
    `password-change:${actor}`
  );
  const users = db.collection<{ _id: mongo.ObjectId; password: string; isVirtual?: boolean }>(
    'users'
  );
  const _id = new mongo.ObjectId(actor);
  const user = await users.findOne(
    { _id, isVirtual: { $ne: true } },
    { projection: { password: 1 } }
  );
  if (!user) throw new AccountPasswordError('NOT_FOUND');
  if (!(await bcrypt.compare(parsed.data.current_password, user.password)))
    throw new AccountPasswordError('INVALID_CURRENT_PASSWORD');
  const password = await bcrypt.hash(parsed.data.new_password, 10);
  // Concurrent reset/change cannot overwrite a newer password; the same atomic update revokes cookies.
  const result = await users.updateOne(
    { _id, isVirtual: { $ne: true }, password: user.password },
    {
      $set: { password },
      $inc: { authVersion: 1 },
    }
  );
  if (result.modifiedCount !== 1) throw new AccountPasswordError('RESOURCE_CHANGED');
  // Native access/refresh validation already binds every session to the stored bcrypt hash.
  return { changed: true as const, reauthenticate: true as const };
}
