import mongoose from 'mongoose';
import { idSchema, virtualMemberCreateInput } from '@travel-budget/contracts';
import { manageMember, readTripMembers } from '@/lib/memberManagement';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { getEnv } from '@/lib/env';
import { requireTripMember } from './access';
import { ApiError, readBody } from './http';
import { tripEntryError } from './tripEntry';
function mapError(error: unknown) {
  if (error instanceof TripWriteError) return new ApiError(404, 'NOT_FOUND');
  if (error instanceof TripEntryError && error.code === 'FORBIDDEN')
    return new ApiError(403, 'FORBIDDEN');
  if (error instanceof TripEntryError && ['RESOURCE_CHANGED', 'RESOURCE_GONE'].includes(error.code))
    return new ApiError(409, error.code);
  return tripEntryError(error);
}
export async function mobileTripMembers(actorId: string, id: string) {
  const tripId = await requireTripMember(actorId, id);
  try {
    return await readTripMembers(mongoose.connection.db!, actorId, tripId, getEnv().JWT_SECRET);
  } catch (error) {
    throw mapError(error);
  }
}
export async function mobileManageMember(
  request: Request,
  actorId: string,
  id: string,
  memberId?: string
) {
  const tripId = await requireTripMember(actorId, id);
  if (memberId !== undefined && !idSchema.safeParse(memberId).success)
    throw new ApiError(404, 'RESOURCE_GONE');
  const body = await readBody(request, virtualMemberCreateInput);
  try {
    return await manageMember(
      mongoose.connection.db!,
      actorId,
      tripId,
      memberId === undefined ? 'member.create' : 'member.rename',
      body,
      getEnv().JWT_SECRET,
      memberId
    );
  } catch (error) {
    throw mapError(error);
  }
}
