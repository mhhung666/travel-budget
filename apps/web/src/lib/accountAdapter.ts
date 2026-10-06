import { dbConnect } from './mongodb';
import { getEnv } from './env';
import { sendEmail } from './email';
import { buildPasswordResetEmail } from './emailTemplates';
import { trustedAccountSource, type AccountContext } from './accountEntry';

export async function accountEnvironment(headers: Pick<Headers, 'get'>) {
  const connection = await dbConnect();
  if (!connection.connection.db) throw new Error('Database unavailable');
  const context: AccountContext = {
    secret: getEnv().JWT_SECRET,
    source: trustedAccountSource(headers),
  };
  return { db: connection.connection.db, context };
}
export async function deliverAccountReset(email: string, code: string, locale: string) {
  const content = await buildPasswordResetEmail({ code, locale, expiresMinutes: 15 });
  return sendEmail({ to: email, content });
}
