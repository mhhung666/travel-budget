import { currentLedger, LedgerError } from './ledger';
import { NextRequest, NextResponse } from 'next/server';
import { Trip, Expense, ItineraryDay } from '@/models';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { logger } from '@/lib/logger';
import { readChecklists } from '@/lib/checklistRead';
import { readItinerary } from '@/lib/itineraryRead';
import { readSettlement } from '@/lib/settlementRead';
import { readTripLanding } from '@/lib/tripLandingRead';
import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { computeTripStats } from '@/lib/tripStats';
import {
  toTripDto,
  toExpenseDto,
  toTripStatsInputs,
  type TripDtoInput,
  type ExpenseDtoInput,
  type TripStatExpenseInput,
  type TripStatsTripInput,
  type TripStatsDayInput,
} from '@/lib/dto';

/**
 * Read-only share snapshots behind `/api/public/v2/trips/*` (the v1 URLs were removed in B5e).
 * Each route wraps its handler in the ledger v2 context. They resolve the hash code only,
 * never read the session and never expose receipts or private budgets.
 */

type PopulatedMember = {
  user: {
    _id: { toString(): string };
    username: string;
    displayName: string;
    isVirtual?: boolean | null;
  } | null;
  role: 'admin' | 'member' | null;
  joinedAt: Date;
};

// 公開獲取旅行詳情（不需登入）
const trip = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .select(
        'baseCurrency name description startDate endDate destinationLocation hashCode createdAt'
      )
      .lean<TripDtoInput>();

    if (!trip) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    // 與 actions 的 getTrip 共用映射；不傳 viewerId，archived_at 固定 null
    // （公開唯讀分享情境無個別封存概念）。
    return NextResponse.json({ trip: toTripDto(trip) });
  },
  { logLabel: 'Get public trip error' }
);

const shell = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .select('baseCurrency name startDate endDate hashCode members.user currencySettings')
      .lean<LeanTripShell | null>();
    if (!trip) return apiError(PublicApiError.NOT_FOUND, 404);
    return NextResponse.json({ shell: await readTripShell(trip) });
  },
  { logLabel: 'Get public trip shell error' }
);

async function landing(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await readTripLanding(
      id,
      undefined,
      request.nextUrl.searchParams.get('date') ?? undefined
    );
    return data ? NextResponse.json(data) : apiError(PublicApiError.NOT_FOUND, 404);
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'CLIENT_UPGRADE_REQUIRED')
      return apiError(PublicApiError.CLIENT_UPGRADE_REQUIRED, 409);
    if (error instanceof LedgerError && error.code === 'LEDGER_DATA_INVALID')
      return apiError(PublicApiError.LEDGER_DATA_INVALID, 503);
    logger.error('Get public trip landing error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}

// 公開獲取旅行的所有支出（不需登入）
const expenses = withPublicTrip(
  async ({ tripId }) => {
    // splits 已內嵌，payer 與 splits.user 一次 populate（不再有 N+1）
    const expenses = await Expense.find({ trip: tripId })
      .sort({ date: -1, createdAt: -1 })
      .populate('payer', 'username displayName')
      .populate('splits.user', 'username displayName')
      .lean<ExpenseDtoInput[]>();

    // 與 actions 的 getExpenses 共用同一個映射，避免 snake_case DTO 平行漂移。
    // 收據刻意不外洩到公開分享頁（attachments: false）。
    const data = expenses.map((e) => toExpenseDto(e, tripId, { attachments: false }));

    return NextResponse.json({ expenses: data });
  },
  { logLabel: 'Get public expenses error' }
);

const settlement = withPublicTrip(
  async ({ tripId }) => NextResponse.json(await readSettlement(tripId)),
  { logLabel: 'Get public settlement error' }
);

// 公開獲取旅行群組統計（不需登入；與 settlement 同層級的唯讀分享資料）
const stats = withPublicTrip(
  async ({ tripId }) => {
    const [trip, expenses, days] = await Promise.all([
      Trip.findById(tripId)
        .populate('members.user', 'displayName')
        .select('members startDate endDate')
        .lean<TripStatsTripInput>(),
      Expense.find({ trip: tripId })
        .select('category date description amount payer splits itineraryDays tags')
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
    return NextResponse.json({
      ...computeTripStats(mapped, members, range, mappedDays),
      ledger: currentLedger(),
    });
  },
  { logLabel: 'Get public trip stats error' }
);

// 公開獲取旅行成員列表（不需登入）
const members = withPublicTrip(
  async ({ tripId }) => {
    const trip = await Trip.findById(tripId)
      .populate('members.user', 'username displayName isVirtual')
      .select('members')
      .lean<{ members: PopulatedMember[] } | null>();

    const formattedMembers = (trip?.members || [])
      .filter((m) => m.user)
      .map((m) => ({
        id: m.user!._id.toString(),
        username: m.user!.username,
        display_name: m.user!.displayName,
        is_virtual: m.user!.isVirtual || false,
        joined_at: m.joinedAt.toISOString(),
        role: m.role,
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

    return NextResponse.json({ members: formattedMembers });
  },
  { logLabel: 'Get public trip members error' }
);

const itinerary = withPublicTrip(
  async ({ tripId }) => NextResponse.json({ itinerary: await readItinerary(tripId, false) }),
  { logLabel: 'Get public itinerary error' }
);

const checklists = withPublicTrip(
  async ({ tripId }) => NextResponse.json({ checklists: await readChecklists(tripId) }),
  { logLabel: 'Get public checklists error' }
);

export const publicTripReads = {
  trip,
  shell,
  landing,
  expenses,
  settlement,
  stats,
  members,
  itinerary,
  checklists,
};
