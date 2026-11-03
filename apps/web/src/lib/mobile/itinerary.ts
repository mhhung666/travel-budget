import { idSchema } from '@travel-budget/contracts';
import { getMemberTrip } from '@/lib/permissions';
import { readItinerary } from '@/lib/itineraryRead';
import { projectMobileItinerary } from '../itineraryProjection';
import { ApiError } from './http';

type TripDates = {
  _id: { toString(): string };
  members: { user: { toString(): string }; role?: 'admin' | 'member' | null }[];
  startDate?: Date | null;
  endDate?: Date | null;
};

/** Same reader/order/date rules as Web, with an explicit native read-only projection. */
export async function mobileItinerary(actorId: string, tripId: string) {
  if (!idSchema.safeParse(tripId).success) throw new ApiError(404, 'NOT_FOUND');
  const member = await getMemberTrip<TripDates>(actorId, tripId, '_id startDate endDate');
  if (!member) throw new ApiError(404, 'NOT_FOUND');
  const days = await readItinerary(member.membership.tripId, true);
  return projectMobileItinerary(member.membership.tripId, member.trip, days);
}
