import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getEnv } from './env';
import { dbConnect } from './mongodb';
import { User } from '@/models/User';

let cachedKey: Uint8Array | null = null;

function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  // getEnv() 已驗證 JWT_SECRET 存在且 >= 32 字元，否則拋錯（無不安全 fallback）。
  cachedKey = new TextEncoder().encode(getEnv().JWT_SECRET);
  return cachedKey;
}

export interface SessionPayload {
  userId: string;
  username: string;
  expiresAt: Date;
  authVersion?: number;
}

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getKey());
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, username: string, passwordHash?: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await dbConnect();
  const user = await User.findById(userId).select('authVersion isVirtual password').lean();
  if (!user || user.isVirtual || (passwordHash !== undefined && passwordHash !== user.password))
    throw new Error('Account unavailable');
  const session = await encrypt({
    userId,
    username,
    expiresAt,
    authVersion: user.authVersion ?? 0,
  });

  (await cookies()).set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookie = (await cookies()).get('session')?.value;
  if (!cookie) return null;

  return await validateSession(cookie);
}

export async function deleteSession() {
  (await cookies()).delete('session');
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get('session')?.value;
  if (!token) return null;

  return await validateSession(token);
}

/** Signature alone is insufficient: password change/reset invalidates existing cookies. */
async function validateSession(token: string): Promise<SessionPayload | null> {
  const session = await decrypt(token);
  if (!session || !/^[a-f\d]{24}$/i.test(session.userId)) return null;
  await dbConnect();
  const user = await User.findById(session.userId).select('authVersion isVirtual').lean();
  if (!user || user.isVirtual || (session.authVersion ?? 0) !== (user.authVersion ?? 0))
    return null;
  return session;
}
