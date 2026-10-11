import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { emailChangeRequestInput, emailChangeConfirmInput } from '@travel-budget/contracts';
import { accountPolicy, claimAccountLimit, type AccountContext } from './accountEntry';
import { isAccountDuplicateKey } from './mongoErrors';

const CI = { locale: 'en', strength: 2 } as const;
const lifetime = 900_000;
const hash = (code: string) => createHash('sha256').update(code).digest('hex');
export class AccountEmailError extends Error {
  constructor(
    public code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'SAME_EMAIL'
      | 'CONFLICT'
      | 'INVALID_CODE'
      | 'CODE_EXPIRED'
      | 'TOO_MANY_ATTEMPTS'
      | 'RESOURCE_CHANGED'
      | 'EMAIL_DELIVERY_FAILED'
  ) {
    super(code);
  }
}
interface Account {
  _id: mongo.ObjectId;
  email?: string;
  locale?: string;
  isVirtual?: boolean;
}
interface Candidate {
  id: string;
  newEmail: string;
  codeHash: string;
  expiresAt: Date;
  originalEmail: string;
}
interface Code {
  _id: mongo.ObjectId;
  user: mongo.ObjectId;
  newEmail?: string;
  codeHash?: string;
  expiresAt: Date;
  activeExpiresAt?: Date;
  attempts?: number;
  originalEmail?: string;
  candidate?: Candidate;
}
const actorId = (actor: string) => {
  if (!/^[a-f\d]{24}$/i.test(actor)) throw new AccountEmailError('NOT_FOUND');
  return new mongo.ObjectId(actor);
};
// A self-only user fence serializes request/publish/confirm/cancel, including an absent code row.
async function owner(db: mongo.Db, id: mongo.ObjectId, session: mongo.ClientSession) {
  const user = await db
    .collection<Account>('users')
    .findOneAndUpdate(
      { _id: id, isVirtual: { $ne: true } },
      { $inc: { emailChangeFence: 1 } },
      { returnDocument: 'after', session }
    );
  if (!user) throw new AccountEmailError('NOT_FOUND');
  return user;
}
const transaction = <T>(db: mongo.Db, fn: (session: mongo.ClientSession) => Promise<T>) =>
  db.client.withSession((session) =>
    session.withTransaction(() => fn(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      timeoutMS: 20_000,
    })
  );
async function unique(
  db: mongo.Db,
  id: mongo.ObjectId,
  email: string,
  session: mongo.ClientSession
) {
  if (
    await db
      .collection('users')
      .findOne({ email, _id: { $ne: id } }, { session, collation: CI, projection: { _id: 1 } })
  )
    throw new AccountEmailError('CONFLICT');
}
function limitContext(context: AccountContext) {
  return {
    ...context,
    policy: {
      ...accountPolicy,
      send: { windowMs: 3_600_000, maximum: 5, gapMs: 60_000 },
      verify: { windowMs: lifetime, maximum: 10, gapMs: 0 },
    },
  };
}
export type EmailChangeDelivery = (email: string, code: string, locale: string) => Promise<boolean>;
export async function requestAccountEmail(
  db: mongo.Db,
  actor: string,
  raw: unknown,
  context: AccountContext,
  deliver: EmailChangeDelivery
) {
  const parsed = emailChangeRequestInput.safeParse(raw);
  if (!parsed.success) throw new AccountEmailError('VALIDATION_ERROR');
  const id = actorId(actor),
    now = (context.now ?? Date.now)();
  const input = parsed.data;
  // Authenticated actor is the quota identity, never an arbitrary victim email or forwarded header.
  await claimAccountLimit(db, limitContext(context), 'send', `email-change:${id.toHexString()}`);
  const candidate = await transaction(db, async (session) => {
    const user = await owner(db, id, session);
    if ((user.email ?? '').toLowerCase() === input.new_email)
      throw new AccountEmailError('SAME_EMAIL');
    await unique(db, id, input.new_email, session);
    const codes = db.collection<Code>('emailchangecodes');
    const previous = await codes.findOne({ user: id }, { session });
    let code: string;
    do {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    } while (hash(code) === previous?.codeHash || hash(code) === previous?.candidate?.codeHash);
    const next: Candidate = {
      id: randomUUID(),
      newEmail: input.new_email,
      codeHash: hash(code),
      expiresAt: new Date(now + lifetime),
      originalEmail: user.email ?? '',
    };
    await codes.updateOne(
      { user: id },
      {
        $set: {
          candidate: next,
          ...(previous?.codeHash
            ? { activeExpiresAt: previous.activeExpiresAt ?? previous.expiresAt }
            : {}),
          expiresAt: new Date(
            Math.max(previous?.expiresAt.getTime() ?? 0, next.expiresAt.getTime())
          ),
        },
        $setOnInsert: { createdAt: new Date(now) },
      },
      { upsert: true, session }
    );
    return { next, code, locale: input.locale ?? user.locale ?? 'zh' };
  });
  let delivered = false;
  try {
    delivered = await deliver(input.new_email, candidate.code, candidate.locale);
  } catch {
    /* Transport failure is an explicit delivery failure; never log secrets. */
  }
  const published = await transaction(db, async (session) => {
    const user = await owner(db, id, session);
    const codes = db.collection<Code>('emailchangecodes');
    const record = await codes.findOne(
      { user: id, 'candidate.id': candidate.next.id },
      { session }
    );
    if (!record) return false; // Cancel/confirm/newer send wins over a delayed mail provider.
    if (
      !delivered ||
      (user.email ?? '') !== candidate.next.originalEmail ||
      candidate.next.expiresAt.getTime() <= (context.now ?? Date.now)()
    ) {
      if (record.codeHash)
        await codes.updateOne(
          { _id: record._id },
          {
            $unset: { candidate: '' },
            $set: { expiresAt: record.activeExpiresAt ?? record.expiresAt },
          },
          { session }
        );
      else await codes.deleteOne({ _id: record._id }, { session });
      return false;
    }
    await codes.updateOne(
      { _id: record._id },
      {
        $set: {
          newEmail: candidate.next.newEmail,
          codeHash: candidate.next.codeHash,
          expiresAt: candidate.next.expiresAt,
          activeExpiresAt: candidate.next.expiresAt,
          originalEmail: candidate.next.originalEmail,
          attempts: 0,
        },
        $unset: { candidate: '' },
      },
      { session }
    );
    return true;
  });
  if (!delivered) throw new AccountEmailError('EMAIL_DELIVERY_FAILED');
  if (!published) throw new AccountEmailError('RESOURCE_CHANGED');
  return { sent: true as const, newEmail: input.new_email };
}
/** Legacy Web accepts only code. Native/new Web bind the confirmation to the displayed new email. */
export async function confirmAccountEmail(
  db: mongo.Db,
  actor: string,
  raw: unknown,
  context: AccountContext
) {
  const parsed = emailChangeConfirmInput
    .extend({ new_email: emailChangeConfirmInput.shape.new_email.optional() })
    .safeParse(raw);
  if (!parsed.success) throw new AccountEmailError('VALIDATION_ERROR');
  const input = parsed.data;
  const id = actorId(actor);
  await claimAccountLimit(db, limitContext(context), 'verify', `email-change:${id.toHexString()}`);
  try {
    const result = await transaction(db, async (session) => {
      const user = await owner(db, id, session);
      const codes = db.collection<Code>('emailchangecodes');
      const record = await codes.findOne({ user: id }, { session });
      if (!record?.codeHash || !record.newEmail) return { error: 'INVALID_CODE' as const };
      if (input.new_email !== undefined && input.new_email !== record.newEmail)
        return { error: 'RESOURCE_CHANGED' as const };
      if (record.originalEmail !== undefined && (user.email ?? '') !== record.originalEmail)
        return { error: 'RESOURCE_CHANGED' as const };
      if ((record.activeExpiresAt ?? record.expiresAt).getTime() <= (context.now ?? Date.now)())
        return { error: 'CODE_EXPIRED' as const };
      if ((record.attempts ?? 0) >= 5) return { error: 'TOO_MANY_ATTEMPTS' as const };
      if (record.codeHash !== hash(input.code)) {
        await codes.updateOne({ _id: record._id }, { $inc: { attempts: 1 } }, { session });
        return { error: 'INVALID_CODE' as const };
      }
      await unique(db, id, record.newEmail, session);
      await db
        .collection('users')
        .updateOne({ _id: id }, { $set: { email: record.newEmail } }, { session });
      // Codes issued to the previous mailbox cannot become valid recovery codes for the new one.
      await db.collection('passwordresetcodes').deleteMany({ user: id }, { session });
      await codes.deleteOne({ _id: record._id }, { session });
      return { changed: true as const, email: record.newEmail };
    });
    if ('error' in result) throw new AccountEmailError(result.error!);
    return result;
  } catch (error) {
    if (isAccountDuplicateKey(error)) throw new AccountEmailError('CONFLICT');
    throw error;
  }
}
export async function cancelAccountEmail(db: mongo.Db, actor: string) {
  const id = actorId(actor);
  return transaction(db, async (session) => {
    await owner(db, id, session);
    await db.collection('emailchangecodes').deleteOne({ user: id }, { session });
    return { cancelled: true as const };
  });
}
