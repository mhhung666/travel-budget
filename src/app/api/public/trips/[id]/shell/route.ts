import { NextResponse } from 'next/server';
import { Trip } from '@/models';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { withPublicTrip } from '@/lib/withPublicTrip';
import type { TripShell } from '@/types';

type PublicShellTrip = {
  _id: { toString(): string };
  name: string;
  startDate?: Date | null;
  endDate?: Date | null;
  hashCode: string;
  members?: unknown[];
  currencySettings?: {
    defaultCurrency?: string | null;
    currencies?: { code: string; rate?: number | null }[];
  } | null;
};

/** Public shell never exposes viewer-specific budget or spend data. */
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .select('name startDate endDate hashCode members.user currencySettings')
      .lean<PublicShellTrip | null>();

    if (!trip) return apiError(PublicApiError.NOT_FOUND, 404);

    const shell: TripShell = {
      id: trip._id.toString(),
      name: trip.name,
      start_date: trip.startDate?.toISOString().slice(0, 10) ?? null,
      end_date: trip.endDate?.toISOString().slice(0, 10) ?? null,
      hash_code: trip.hashCode,
      role: null,
      member_count: trip.members?.length ?? 0,
      expense_count: 0,
      today_spent: 0,
      total_spent: 0,
      budget: null,
      legacy_budget: null,
      currency_settings: trip.currencySettings
        ? {
            default_currency: trip.currencySettings.defaultCurrency ?? null,
            currencies: (trip.currencySettings.currencies ?? []).map(({ code, rate }) => ({
              code,
              rate: rate ?? null,
            })),
          }
        : null,
    };

    return NextResponse.json({ shell });
  },
  { logLabel: 'Get public trip shell error' }
);
