import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/mongodb';
import { User } from '@/models';

/** Shared credential check; adapters own their cookie/device session. */
export async function verifyCredentials(username: string, password: string) {
  await dbConnect();
  const user = await User.findOne({ username }).collation({ locale: 'en', strength: 2 });
  if (!user || !(await bcrypt.compare(password, user.password))) return null;
  return user;
}
