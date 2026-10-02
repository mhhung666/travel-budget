import { createHash, createHmac, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Types } from 'mongoose';
import { getEnv } from '@/lib/env';
import { dbConnect } from '@/lib/mongodb';
import { verifyCredentials } from '@/lib/credentials';
import { User } from '@/models';
import { MobileSession, MobileLoginAttempt } from '@/models/MobileSession';
import { ApiError } from './http';
import type { MobileUser } from './contract';

const ISSUER = 'travel-budget/mobile/v1';
const ACCESS_SECONDS = 15 * 60;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// Domain-separated signing key prevents a mobile JWT from being used as a Web cookie.
const key = () => createHmac('sha256', getEnv().JWT_SECRET).update(ISSUER).digest();
const credentialHash = (passwordHash: string) =>
  createHmac('sha256', key()).update(passwordHash).digest('hex');
const dto = (user: {
  _id: { toString(): string };
  username: string;
  displayName: string;
}): MobileUser => ({
  id: user._id.toString(),
  username: user.username,
  displayName: user.displayName,
});

async function sign(userId: string, sid: string, kind: 'access' | 'refresh', expires: number) {
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(kind)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key());
}
async function verify(token: string, kind: 'access' | 'refresh') {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: kind,
    });
    if (
      typeof payload.sid !== 'string' ||
      !/^[a-f\d]{24}$/.test(payload.sid) ||
      typeof payload.sub !== 'string' ||
      !/^[a-f\d]{24}$/.test(payload.sub)
    )
      throw new Error();
    return { sid: payload.sid, userId: payload.sub };
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED');
  }
}
async function tokens(user: MobileUser, sid: string, expiresAt: Date) {
  const now = Math.floor(Date.now() / 1000);
  return {
    user,
    expiresIn: ACCESS_SECONDS,
    accessToken: await sign(user.id, sid, 'access', now + ACCESS_SECONDS),
    refreshToken: await sign(user.id, sid, 'refresh', Math.floor(expiresAt.getTime() / 1000)),
  };
}
async function activeSession(sid: string, userId: string) {
  await dbConnect();
  const session = await MobileSession.findOne({
    _id: sid,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) throw new ApiError(401, 'UNAUTHORIZED');
  const user = await User.findById(userId).select('username displayName password isVirtual');
  if (!user || user.isVirtual || credentialHash(user.password) !== session.credentialHash) {
    await MobileSession.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
    throw new ApiError(401, 'UNAUTHORIZED');
  }
  return { session, user };
}
export async function loginMobile(username: string, password: string) {
  await dbConnect();
  const windowMs = 15 * 60 * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const attempt = await MobileLoginAttempt.findOneAndUpdate(
    { _id: hash(`${username.toLowerCase()}:${bucket}`) },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } },
    { upsert: true, returnDocument: 'after' }
  );
  if (attempt.count > 10)
    throw new ApiError(
      429,
      'RATE_LIMITED',
      Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)
    );
  const user = await verifyCredentials(username, password);
  if (!user || user.isVirtual) throw new ApiError(401, 'INVALID_CREDENTIALS');
  const id = new Types.ObjectId();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const result = await tokens(dto(user), id.toString(), expiresAt);
  await MobileSession.create({
    _id: id,
    user: user._id,
    refreshHash: hash(result.refreshToken),
    credentialHash: credentialHash(user.password),
    expiresAt,
  });
  return result;
}
export async function refreshMobile(token: string) {
  const { sid, userId } = await verify(token, 'refresh');
  const { session, user } = await activeSession(sid, userId);
  const result = await tokens(dto(user), sid, session.expiresAt);
  // Compare-and-swap: exactly one request can consume the current refresh token.
  const changed = await MobileSession.updateOne(
    { _id: sid, refreshHash: hash(token), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { refreshHash: hash(result.refreshToken) } }
  );
  if (changed.modifiedCount !== 1) {
    // A correctly signed but consumed token indicates replay. Revoke the whole device session.
    await MobileSession.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
    throw new ApiError(401, 'SESSION_REVOKED');
  }
  return result;
}
export async function requireMobileUser(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096)
    throw new ApiError(401, 'UNAUTHORIZED');
  const { sid, userId } = await verify(authorization.slice(7), 'access');
  const { user } = await activeSession(sid, userId);
  return dto(user);
}
export async function logoutMobile(token: string) {
  // Signed refresh token also permits logout when the access token has expired.
  const { sid, userId } = await verify(token, 'refresh');
  await dbConnect();
  await MobileSession.updateOne({ _id: sid, user: userId }, { $set: { revokedAt: new Date() } });
  return { loggedOut: true };
}
