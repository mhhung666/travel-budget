import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const key = new TextEncoder().encode(SECRET_KEY);

export interface SessionPayload {
  userId: number;
  username: string;
  expiresAt: Date;
}

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload as any;
  } catch (error) {
    return null;
  }
}

export async function createSession(userId: number, username: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const session = await encrypt({ userId, username, expiresAt });

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

  return await decrypt(cookie);
}

export async function deleteSession() {
  (await cookies()).delete('session');
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get('session')?.value;
  if (!token) return null;

  return await decrypt(token);
}
