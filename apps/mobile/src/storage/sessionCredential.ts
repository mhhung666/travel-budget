import { z } from 'zod';
import { userSchema, type User } from '@/api/contracts';

const savedSchema = z
  .object({ version: z.literal(1), token: z.string().min(1), user: userSchema })
  .strict();
/** Keep local identity and refresh credential in one atomic SecureStore value. Legacy tokens work online. */
export function decodeCredential(value: string | null): {
  token: string | null;
  user: User | null;
} {
  if (!value) return { token: null, user: null };
  if (!value.startsWith('{')) return { token: value, user: null };
  const parsed = savedSchema.parse(JSON.parse(value));
  return { token: parsed.token, user: parsed.user };
}
export function encodeCredential(token: string, user?: User): string {
  return user ? JSON.stringify(savedSchema.parse({ version: 1, token, user })) : token;
}
