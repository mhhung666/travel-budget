/** Shared capacity for manual, note and AI itinerary writes. */
export const MAX_ACTIVITIES_PER_DAY = 15;

/** Include in the same MongoDB write that appends activities. */
export function activityCapacityFilter(added: number) {
  return {
    $expr: {
      $lte: [{ $size: { $ifNull: ['$activities', []] } }, MAX_ACTIVITIES_PER_DAY - added],
    },
  };
}
