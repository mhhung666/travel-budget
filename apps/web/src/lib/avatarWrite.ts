import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import {
  avatarWriteInput,
  type AvatarWriteInput,
  type AvatarWriteState,
} from '@travel-budget/contracts';
import { buildObjectKey, isAvatarKeyForUser, validateUpload } from './uploads';
import { avatarPublicUrl, avatarKeyFromUrl, headObject, presignPut } from './storage';
export class AvatarWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const LEASE_MS = 24 * 60 * 60_000;
const GRACE_MS = 5 * 60_000;
const keyOf = (actor: string, uuid: string) => `${actor}:${uuid.toLowerCase()}`;
interface AvatarUser {
  _id: mongo.ObjectId;
  avatarUrl?: string;
  avatarRevision?: number;
}
interface Job {
  _id: string;
  actor: string;
  input: AvatarWriteInput;
  key?: string;
  expiresAt: Date;
  state: AvatarWriteState;
}
interface Cleanup {
  _id: string;
  actor: string;
  retired: boolean;
  availableAt?: Date;
  token?: string;
  firstSweep?: boolean;
  requestId?: string;
}
const jobs = (db: mongo.Db) => db.collection<Job>('avatarwrites');
const cleanup = (db: mongo.Db) => db.collection<Cleanup>('avatarcleanupjobs');
const userFilter = (actor: string) => ({
  _id: new mongo.ObjectId(actor),
  isVirtual: { $ne: true },
});
function context(user: AvatarUser) {
  return {
    avatarUrl: user.avatarUrl ?? null,
    revision: createHash('sha256')
      .update(
        JSON.stringify([user._id.toHexString(), user.avatarUrl ?? null, user.avatarRevision ?? 0])
      )
      .digest('hex'),
  };
}
async function ownedUser(db: mongo.Db, actor: string, session?: mongo.ClientSession) {
  const user = await db.collection<AvatarUser>('users').findOne(userFilter(actor), {
    session,
    projection: { _id: 1, avatarUrl: 1, avatarRevision: 1 },
  });
  if (!user) throw new AvatarWriteError('NOT_FOUND');
  return user;
}
async function write<T>(
  db: mongo.Db,
  actor: string,
  work: (s: mongo.ClientSession, user: AvatarUser) => Promise<T>
): Promise<T> {
  return db.client.withSession((s) =>
    s.withTransaction(
      async () => {
        const user = await db.collection<AvatarUser>('users').findOneAndUpdate(
          userFilter(actor),
          { $inc: { avatarWriteFence: 1 } },
          {
            session: s,
            returnDocument: 'after',
            projection: { _id: 1, avatarUrl: 1, avatarRevision: 1 },
          }
        );
        if (!user) throw new AvatarWriteError('NOT_FOUND');
        return work(s, user);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 5000,
      }
    )
  );
}
export async function readAvatar(db: mongo.Db, actor: string) {
  return context(await ownedUser(db, actor));
}
export async function avatarWriteStatus(db: mongo.Db, actor: string, uuid: string) {
  await ownedUser(db, actor);
  return (
    (await jobs(db).findOne({ _id: keyOf(actor, uuid) }))?.state ?? {
      clientRequestId: uuid,
      status: 'not_found' as const,
    }
  );
}
async function retire(
  db: mongo.Db,
  s: mongo.ClientSession,
  actor: string,
  key: string,
  notBefore = Date.now() + GRACE_MS
) {
  if (!isAvatarKeyForUser(actor, key)) return;
  await cleanup(db).updateOne(
    { _id: key },
    {
      $set: { actor, retired: true },
      $max: { availableAt: new Date(notBefore) },
      $unset: { token: '' },
    },
    { upsert: true, session: s }
  );
}
async function apply(
  db: mongo.Db,
  s: mongo.ClientSession,
  actor: string,
  user: AvatarUser,
  url: string | null
) {
  if (url) {
    const key = avatarKeyFromUrl(url);
    if (
      !key ||
      !isAvatarKeyForUser(actor, key) ||
      (await cleanup(db).findOne({ _id: key, retired: true }, { session: s }))
    )
      throw new AvatarWriteError('CONFLICT');
    // Successful references stop the staging cleanup; retired keys can never become live again.
    await cleanup(db).updateOne(
      { _id: key },
      { $unset: { availableAt: '', token: '' } },
      { session: s }
    );
  }
  await db.collection('users').updateOne(
    userFilter(actor),
    {
      $inc: { avatarRevision: 1 },
      ...(url ? { $set: { avatarUrl: url } } : { $unset: { avatarUrl: '' } }),
    },
    { session: s }
  );
  if (user.avatarUrl && user.avatarUrl !== url) {
    const old = avatarKeyFromUrl(user.avatarUrl);
    if (old) await retire(db, s, actor, old);
  }
  return context({
    ...user,
    avatarUrl: url ?? undefined,
    avatarRevision: (user.avatarRevision ?? 0) + 1,
  });
}
export async function beginAvatarWrite(
  db: mongo.Db,
  actor: string,
  raw: unknown
): Promise<AvatarWriteState> {
  const input = avatarWriteInput.parse(raw);
  const objectKey =
    input.action === 'replace' ? buildObjectKey('avatar', actor, input.contentType) : undefined;
  return write(db, actor, async (s, user) => {
    const _id = keyOf(actor, input.client_request_id),
      previous = await jobs(db).findOne({ _id }, { session: s });
    if (previous) {
      if (JSON.stringify(previous.input) !== JSON.stringify(input))
        throw new AvatarWriteError('IDEMPOTENCY_CONFLICT');
      return previous.state;
    }
    // Expired/pending operations don't block other devices. Revisions prevent stale finalization.
    const expiresAt = new Date(Date.now() + LEASE_MS);
    const state: AvatarWriteState = { clientRequestId: input.client_request_id, status: 'pending' };
    if (context(user).revision !== input.expectedRevision)
      Object.assign(state, { status: 'rejected', code: 'RESOURCE_CHANGED' });
    else if (input.action === 'remove')
      Object.assign(state, { status: 'committed', avatar: await apply(db, s, actor, user, null) });
    if (objectKey && state.status === 'pending')
      await cleanup(db).insertOne(
        {
          _id: objectKey,
          actor,
          retired: false,
          requestId: _id,
          availableAt: new Date(expiresAt.getTime() + GRACE_MS),
        },
        { session: s }
      );
    await jobs(db).insertOne(
      { _id, actor, input, key: objectKey, expiresAt, state },
      { session: s }
    );
    return state;
  });
}
export async function commandAvatarWrite(
  db: mongo.Db,
  actor: string,
  uuid: string,
  action: 'upload' | 'finish' | 'cancel'
) {
  await ownedUser(db, actor);
  const before = await jobs(db).findOne({ _id: keyOf(actor, uuid) });
  if (!before) {
    if (action !== 'cancel') throw new AvatarWriteError('REQUEST_NOT_FOUND');
    return write(db, actor, async (s, user) => {
      const existing = await jobs(db).findOne({ _id: keyOf(actor, uuid) }, { session: s });
      if (existing) {
        if (existing.state.status !== 'pending') return existing.state;
        const state: AvatarWriteState = {
          clientRequestId: existing.input.client_request_id,
          status: 'rejected',
          code: 'CANCELLED',
        };
        if (existing.key)
          await retire(db, s, actor, existing.key, existing.expiresAt.getTime() + GRACE_MS);
        await jobs(db).updateOne({ _id: existing._id }, { $set: { state } }, { session: s });
        return state;
      }
      const state: AvatarWriteState = {
        clientRequestId: uuid.toLowerCase(),
        status: 'rejected',
        code: 'CANCELLED',
      };
      await jobs(db).insertOne(
        {
          _id: keyOf(actor, uuid),
          actor,
          input: {
            action: 'remove',
            client_request_id: uuid.toLowerCase(),
            expectedRevision: context(user).revision,
          },
          expiresAt: new Date(),
          state,
        },
        { session: s }
      );
      return state;
    });
  }
  if (before.state.status !== 'pending') return before.state;
  const head =
    action === 'finish' && before.key
      ? await headObject('avatars', before.key, { strict: true })
      : null;
  const result = await write(db, actor, async (s, user) => {
    const job = (await jobs(db).findOne({ _id: before._id }, { session: s }))!;
    if (job.state.status !== 'pending') return job.state;
    const state = { ...job.state };
    if (action === 'cancel') Object.assign(state, { status: 'rejected', code: 'CANCELLED' });
    else if (job.expiresAt.getTime() <= Date.now() + GRACE_MS)
      Object.assign(state, { status: 'rejected', code: 'EXPIRED' });
    else if (context(user).revision !== job.input.expectedRevision)
      Object.assign(state, { status: 'rejected', code: 'RESOURCE_CHANGED' });
    else if (action === 'finish') {
      if (!head) throw new AvatarWriteError('UPLOAD_INCOMPLETE');
      if (
        job.input.action !== 'replace' ||
        !validateUpload('avatar', head.contentType, head.size).ok ||
        head.size !== job.input.size ||
        head.contentType !== job.input.contentType
      )
        Object.assign(state, { status: 'rejected', code: 'VALIDATION_ERROR' });
      else
        Object.assign(state, {
          status: 'committed',
          avatar: await apply(db, s, actor, user, avatarPublicUrl(job.key!)),
        });
    }
    if (state.status !== 'pending') {
      if (state.status === 'rejected' && job.key)
        await retire(db, s, actor, job.key, job.expiresAt.getTime() + GRACE_MS);
      await jobs(db).updateOne({ _id: job._id }, { $set: { state } }, { session: s });
    }
    return state;
  });
  if (action !== 'upload' || result.status !== 'pending') return result;
  return {
    ...result,
    upload: {
      url: await presignPut(
        'avatars',
        before.key!,
        (before.input as Extract<AvatarWriteInput, { action: 'replace' }>).contentType,
        { immutable: true }
      ),
      contentType: (before.input as Extract<AvatarWriteInput, { action: 'replace' }>).contentType,
      expiresAt: Date.now() + 120_000,
    },
  };
}
/** Existing Web adapters share the user fence, validation and durable cleanup. */
export async function createWebAvatarUpload(
  db: mongo.Db,
  actor: string,
  contentType: string,
  size: number
) {
  if (!validateUpload('avatar', contentType, size).ok)
    throw new AvatarWriteError('VALIDATION_ERROR');
  const key = buildObjectKey('avatar', actor, contentType);
  await write(db, actor, async (s) => {
    await cleanup(db).insertOne(
      { _id: key, actor, retired: false, availableAt: new Date(Date.now() + LEASE_MS + GRACE_MS) },
      { session: s }
    );
  });
  // Preserve existing Web ticket headers for cached clients; native tickets are immutable.
  return { key, uploadUrl: await presignPut('avatars', key, contentType) };
}
export async function setWebAvatar(db: mongo.Db, actor: string, key: string) {
  if (!isAvatarKeyForUser(actor, key)) throw new AvatarWriteError('VALIDATION_ERROR');
  const head = await headObject('avatars', key, { strict: true });
  if (!head || !validateUpload('avatar', head.contentType, head.size).ok)
    throw new AvatarWriteError('VALIDATION_ERROR');
  return write(db, actor, (s, user) => apply(db, s, actor, user, avatarPublicUrl(key)));
}
export async function removeWebAvatar(db: mongo.Db, actor: string) {
  return write(db, actor, (s, user) => apply(db, s, actor, user, null));
}
/** Bounded worker, persistent tombstones, delayed second sweep catches late in-flight PUTs. */
export async function runAvatarCleanup(
  db: mongo.Db,
  deleteKeys: (keys: string[]) => Promise<void>,
  options: { now?: Date; deadline?: number } = {}
) {
  const now = options.now ?? new Date();
  const due = await cleanup(db)
    .find({ availableAt: { $lte: now } })
    .sort({ availableAt: 1 })
    .limit(30)
    .toArray();
  let swept = 0;
  for (const candidate of due) {
    if (options.deadline && Date.now() >= options.deadline) break;
    const token = randomUUID();
    const claimed = await db.client.withSession((s) =>
      s.withTransaction(
        async () => {
          await db
            .collection('users')
            .updateOne(
              { _id: new mongo.ObjectId(candidate.actor) },
              { $inc: { avatarWriteFence: 1 } },
              { session: s }
            );
          const job = await cleanup(db).findOne(
            { _id: candidate._id, availableAt: { $lte: now } },
            { session: s }
          );
          if (!job) return false;
          if (
            await db
              .collection('users')
              .findOne({ avatarUrl: avatarPublicUrl(job._id) }, { session: s })
          ) {
            await cleanup(db).updateOne(
              { _id: job._id },
              { $unset: { availableAt: '', token: '' } },
              { session: s }
            );
            return false;
          }
          await cleanup(db).updateOne(
            { _id: job._id },
            { $set: { retired: true, token, availableAt: new Date(now.getTime() + GRACE_MS) } },
            { session: s }
          );
          if (job.requestId) {
            const p = await jobs(db).findOne(
              { _id: job.requestId, 'state.status': 'pending' },
              { session: s }
            );
            if (p)
              await jobs(db).updateOne(
                { _id: p._id },
                {
                  $set: {
                    state: {
                      clientRequestId: p.input.client_request_id,
                      status: 'rejected',
                      code: 'EXPIRED',
                    },
                  },
                },
                { session: s }
              );
          }
          return true;
        },
        { timeoutMS: 5000 }
      )
    );
    if (!claimed) continue;
    try {
      await deleteKeys([candidate._id]);
      await cleanup(db).updateOne(
        { _id: candidate._id, token },
        candidate.firstSweep
          ? { $unset: { availableAt: '', token: '' } }
          : {
              $set: { firstSweep: true, availableAt: new Date(now.getTime() + LEASE_MS) },
              $unset: { token: '' },
            }
      );
      swept++;
    } catch {
      /* Lease expiration retries deletion; tombstone never expires. */
    }
  }
  return swept;
}
