import { NextResponse } from 'next/server';
import { Trip, Expense, ItineraryDay } from '@/models';
import { computeTripStats } from '@/lib/tripStats';
import {
  toTripStatsInputs,
  type TripStatExpenseInput,
  type TripStatsTripInput,
  type TripStatsDayInput,
} from '@/lib/dto';
import { withPublicTrip } from '@/lib/withPublicTrip';

// 公開獲取旅行群組統計（不需登入；與 settlement 同層級的唯讀分享資料）
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const [trip, expenses, days] = await Promise.all([
      Trip.findById(tripId)
        .populate('members.user', 'displayName')
        .select('members startDate endDate')
        .lean<TripStatsTripInput>(),
      Expense.find({ trip: tripId })
        .select('category date description amount payer splits itineraryDay')
        .populate('payer', 'displayName')
        .lean<TripStatExpenseInput[]>(),
      ItineraryDay.find({ trip: tripId })
        .select('dayNumber title')
        .sort({ dayNumber: 1 })
        .lean<TripStatsDayInput[]>(),
    ]);

    const {
      members,
      expenses: mapped,
      range,
      days: mappedDays,
    } = toTripStatsInputs(trip, expenses, days);
    return NextResponse.json(computeTripStats(mapped, members, range, mappedDays));
  },
  { logLabel: 'Get public trip stats error' }
);
