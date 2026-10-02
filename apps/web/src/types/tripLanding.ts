import type { Trip, TripShell, ItineraryDay, Checklist, Settlement } from '@/types';

export interface TripLanding {
  trip: Trip;
  shell: TripShell;
  itinerary: ItineraryDay[];
  checklists: Checklist[] | null;
  settlement: Settlement | null;
}
