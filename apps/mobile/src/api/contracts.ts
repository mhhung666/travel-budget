import { z } from 'zod';
import { sessionSchema as sharedSessionSchema } from '@travel-budget/contracts';

export { userSchema, tripSchema, tripsSchema, landingSchema } from '@travel-budget/contracts';
export type { MobileUser as User, MobileTrip as Trip } from '@travel-budget/contracts';

// Preserve the client's existing rejection of empty credentials.
export const sessionSchema = sharedSessionSchema.extend({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;
