import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import {
  registerInput,
  passwordResetRequestInput,
  passwordResetInput,
  type RegisterInput,
  type PasswordResetRequestInput,
  type PasswordResetInput,
} from '@travel-budget/contracts';
import { isAccountDuplicateKey } from './mongoErrors';

export const ACCOUNT_ATTEMPTS = 'accountentryattempts';
export class AccountEntryError extends Error {
  constructor(
    public code:
      | 'ACCOUNT_CONFLICT'
      | 'INVALID_CODE'
      | 'CODE_EXPIRED'
      | 'TOO_MANY_ATTEMPTS'
      | 'RATE_LIMITED',
    public retryAfter?: number
  ) {
    super(code);
  }
}
const CI = { locale: 'en', strength: 2 } as const;
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const MINUTE = 60_000;
export const accountPolicy = {
  source: { windowMs: 60 * MINUTE, maximum: 20, gapMs: 0 },
  register: { windowMs: 60 * MINUTE, maximum: 20, gapMs: 0 },
  send: { windowMs: 60 * MINUTE, maximum: 5, gapMs: MINUTE },
  verify: { windowMs: 15 * MINUTE, maximum: 10, gapMs: 0 },
};
type Policy = typeof accountPolicy;
export type AccountContext = {
  secret: string;
  source?: string;
  now?: () => number;
  policy?: Policy;
};
interface Attempt {
  _id: string;
  hits: Date[];
  grant: string;
  expiresAt: Date;
}
interface Account {
  _id: mongo.ObjectId;
  username: string;
  displayName: string;
  email: string;
  password: string;
  locale?: string;
  isVirtual?: boolean;
}
interface ResetCode {
  _id: mongo.ObjectId;
  user: mongo.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}
/** Only the existing Vercel ingress is trusted. Never trust client forwarding headers elsewhere.
 * https://vercel.com/docs/headers/request-headers#x-forwarded-for
 */
export function trustedAccountSource(
  headers: Pick<Headers, 'get'>,
  vercel = process.env.VERCEL === '1'
) {
  if (!vercel) return undefined;
  const value = headers.get('x-forwarded-for')?.trim();
  if (!value || !isIP(value)) return undefined;
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname : value;
}
/** One atomic rolling-window claim, including cooldown. Rejection never extends the deadline. */
export async function claimAccountLimit(
  db: mongo.Db,
  context: AccountContext,
  kind: keyof Policy,
  identity: string
) {
  const now = (context.now ?? Date.now)();
  const { windowMs, maximum, gapMs } = (context.policy ?? accountPolicy)[kind];
  const _id = createHmac('sha256', context.secret)
    .update(`account-entry:${kind}:${identity}`)
    .digest('hex');
  const grant = randomUUID();
  const collection = db.collection<Attempt>(ACCOUNT_ATTEMPTS);
  const pipeline = [
    {
      $set: {
        hits: {
          $filter: {
            input: { $ifNull: ['$hits', []] },
            as: 'hit',
            cond: { $gt: ['$$hit', new Date(now - windowMs)] },
          },
        },
      },
    },
    {
      $set: {
        allowed: {
          $and: [
            { $lt: [{ $size: '$hits' }, maximum] },
            {
              $lte: [
                { $ifNull: [{ $arrayElemAt: ['$hits', -1] }, new Date(0)] },
                new Date(now - gapMs),
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        grant: { $cond: ['$allowed', grant, '$grant'] },
        hits: { $cond: ['$allowed', { $concatArrays: ['$hits', [new Date(now)]] }, '$hits'] },
        expiresAt: { $cond: ['$allowed', new Date(now + windowMs), '$expiresAt'] },
      },
    },
    { $unset: 'allowed' },
  ];
  let record: Attempt | null;
  try {
    record = await collection.findOneAndUpdate({ _id }, pipeline, {
      upsert: true,
      returnDocument: 'after',
    });
  } catch (error) {
    // Concurrent first upserts may race on _id; retry only that collision, without inserting.
    if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) throw error;
    record = await collection.findOneAndUpdate({ _id }, pipeline, { returnDocument: 'after' });
  }
  if (!record) throw new Error('Account limit unavailable');
  if (record.grant !== grant) {
    const oldest = record.hits[0]?.getTime() ?? now;
    const last = record.hits.at(-1)?.getTime() ?? now;
    const until = Math.max(record.hits.length >= maximum ? oldest + windowMs : now, last + gapMs);
    throw new AccountEntryError('RATE_LIMITED', Math.max(1, Math.ceil((until - now) / 1000)));
  }
}
async function sourceLimit(db: mongo.Db, context: AccountContext) {
  if (context.source) await claimAccountLimit(db, context, 'source', context.source);
}
export async function registerAccount(db: mongo.Db, raw: RegisterInput, context: AccountContext) {
  const input = registerInput.parse(raw);
  await sourceLimit(db, context);
  await claimAccountLimit(db, context, 'register', input.username.toLowerCase());
  const users = db.collection<Account>('users');
  if (
    await users.findOne(
      { $or: [{ username: input.username }, { email: input.email }] },
      { collation: CI, projection: { _id: 1 } }
    )
  )
    throw new AccountEntryError('ACCOUNT_CONFLICT');
  const user = {
    _id: new mongo.ObjectId(),
    username: input.username,
    displayName: input.display_name,
    email: input.email,
    password: await bcrypt.hash(input.password, 10),
    isVirtual: false,
    createdAt: new Date((context.now ?? Date.now)()),
    notifyByEmail: true,
    locale: 'zh',
  };
  try {
    await users.insertOne(user);
  } catch (error) {
    if (isAccountDuplicateKey(error)) throw new AccountEntryError('ACCOUNT_CONFLICT');
    throw error;
  }
  return { id: user._id.toHexString(), username: user.username, displayName: user.displayName };
}
export type ResetDelivery = (email: string, code: string, locale: string) => Promise<unknown>;
export async function requestAccountReset(
  db: mongo.Db,
  raw: PasswordResetRequestInput,
  context: AccountContext,
  deliver: ResetDelivery
) {
  const input = passwordResetRequestInput.parse(raw);
  await sourceLimit(db, context);
  await claimAccountLimit(db, context, 'send', input.email);
  const user = await db
    .collection<Account>('users')
    .findOne({ email: input.email, isVirtual: { $ne: true } }, { collation: CI });
  if (user) {
    const code = await db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          const codes = db.collection<ResetCode>('passwordresetcodes');
          const previous = await codes.findOne({ user: user._id }, { session });
          let next: string;
          do {
            next = randomInt(0, 1_000_000).toString().padStart(6, '0');
          } while (hashCode(next) === previous?.codeHash);
          const now = (context.now ?? Date.now)();
          await codes.updateOne(
            { user: user._id },
            {
              $set: {
                codeHash: hashCode(next),
                expiresAt: new Date(now + 15 * MINUTE),
                attempts: 0,
              },
              $setOnInsert: { createdAt: new Date(now) },
            },
            { upsert: true, session }
          );
          return next;
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 20_000,
        }
      )
    );
    // Delivery failure has the same accepted response as an unknown email. Never log the code.
    await deliver(user.email, code, input.locale ?? user.locale ?? 'zh').catch(() => {});
  }
  return { accepted: true as const };
}
export async function confirmAccountReset(
  db: mongo.Db,
  raw: PasswordResetInput,
  context: AccountContext
) {
  const input = passwordResetInput.parse(raw);
  await claimAccountLimit(db, context, 'verify', input.email);
  const password = await bcrypt.hash(input.new_password, 10);
  const result = await db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const users = db.collection<Account>('users');
        const codes = db.collection<ResetCode>('passwordresetcodes');
        const user = await users.findOne(
          { email: input.email, isVirtual: { $ne: true } },
          { session, collation: CI }
        );
        const record = user ? await codes.findOne({ user: user._id }, { session }) : null;
        if (!user || !record) return 'INVALID_CODE' as const;
        if (record.expiresAt.getTime() <= (context.now ?? Date.now)())
          return 'CODE_EXPIRED' as const;
        if ((record.attempts ?? 0) >= 5) return 'TOO_MANY_ATTEMPTS' as const;
        if (record.codeHash !== hashCode(input.code)) {
          // Committed with the transaction; concurrent failures retry and cannot lose increments.
          await codes.updateOne({ _id: record._id }, { $inc: { attempts: 1 } }, { session });
          return 'INVALID_CODE' as const;
        }
        await codes.deleteOne({ _id: record._id }, { session });
        await users.updateOne({ _id: user._id }, { $set: { password } }, { session });
        return null;
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 20_000,
      }
    )
  );
  if (result) throw new AccountEntryError(result);
  return { reset: true as const };
}
