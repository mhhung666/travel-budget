import { Trip as TripModel } from '@/models';
import { readChecklists } from '@/lib/checklistRead';
import { dbConnect } from '@/lib/mongodb';
import { getMemberTrip } from '@/lib/permissions';
import { toTripDto, type TripDtoInput } from '@/lib/dto';
import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { readItinerary } from '@/lib/itineraryRead';
import { readSettlement } from '@/lib/settlementRead';
import type { TripLanding } from '@/types/tripLanding';

const projection =
  'name description startDate endDate destinationLocation hashCode createdAt currencySettings';
type LandingTrip = TripDtoInput & LeanTripShell;

/** A bounded landing payload: no expense rows, photos, tags or member profiles. */
export async function readTripLanding(
  id: string,
  viewerId?: string,
  viewerDate?: string
): Promise<TripLanding | null> {
  let trip: LandingTrip | null;
  if (viewerId) {
    const result = await getMemberTrip<LandingTrip>(viewerId, id, `${projection} legacyBudget`);
    trip = result?.trip ?? null;
  } else {
    // The public capability is exclusively a short share code, never an ObjectId.
    if (!/^[a-z0-9]{6,10}$/.test(id)) return null;
    await dbConnect();
    trip = await TripModel.findOne({ hashCode: id })
      .select(`${projection} members.user`)
      .lean<LandingTrip | null>();
  }
  if (!trip) return null;
  const tripId = trip._id.toString();
  const dto = toTripDto(trip, viewerId);
  const today =
    viewerDate && /^\d{4}-\d{2}-\d{2}$/.test(viewerDate)
      ? viewerDate
      : new Date().toISOString().slice(0, 10);
  const phase =
    dto.start_date && today < dto.start_date
      ? 'preTrip'
      : dto.end_date && today > dto.end_date
        ? 'postTrip'
        : dto.start_date
          ? 'ongoing'
          : 'preTrip';
  const [shell, itinerary, checklists, settlement] = await Promise.all([
    readTripShell(trip, viewerId, today),
    readItinerary(tripId, !!viewerId),
    phase === 'preTrip' ? readChecklists(tripId) : Promise.resolve(null),
    phase === 'postTrip'
      ? readSettlement(
          tripId,
          trip.members.map((member) => member.user.toString())
        )
      : Promise.resolve(null),
  ]);
  return { trip: dto, shell, itinerary, checklists, settlement };
}
