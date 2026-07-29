'use server';

import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense, ItineraryDay } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { computeTripStats } from '@/lib/tripStats';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type {
  StatsData,
  CategoryStat,
  TagStat,
  ExpenseDetail,
  PersonalTripStat,
  StatsComparison,
  TripStatsData,
} from '@/types';
import { logger } from '@/lib/logger';
import {
  toTripStatsInputs,
  type TripStatExpenseInput,
  type TripStatsTripInput,
  type TripStatsDayInput,
} from '@/lib/dto';

interface GetStatsOptions {
  startDate?: string;
  endDate?: string;
  compare?: boolean;
}

type LeanStatExpense = {
  _id: { toString(): string };
  category: string | null;
  date: Date;
  description: string;
  splits: { user: { toString(): string }; shareAmount: number }[];
  trip: { _id: { toString(): string }; name: string } | null;
  tags?: string[] | null;
};

type StatsAggregate = Pick<
  StatsData,
  | 'categoryStats'
  | 'tripStats'
  | 'tagStats'
  | 'totalAmount'
  | 'totalExpenses'
  | 'tripCount'
  | 'recentExpenses'
>;

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inclusiveDayCount(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 0;
  return Math.max(
    1,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / DAY_MS
    ) + 1
  );
}

function previousPeriod(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return null;
  const days = inclusiveDayCount(startDate, endDate);
  const previousEnd = new Date(`${startDate}T00:00:00.000Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return { startDate: dateOnly(previousStart), endDate: dateOnly(previousEnd), days };
}

function aggregatePersonalStats(expenses: LeanStatExpense[], userId: string): StatsAggregate {
  const categoryMap = new Map<string, { total: number; count: number; details: ExpenseDetail[] }>();
  const tripMap = new Map<
    string,
    { tripName: string; total: number; count: number; details: ExpenseDetail[] }
  >();
  const tagMap = new Map<string, { total: number; count: number; details: ExpenseDetail[] }>();
  const allDetails: ExpenseDetail[] = [];

  for (const expense of expenses) {
    const share =
      expense.splits.find((split) => split.user.toString() === userId)?.shareAmount || 0;
    const category = expense.category || 'other';
    const tripId = expense.trip?._id.toString() || '';
    const detail: ExpenseDetail = {
      id: expense._id.toString(),
      date: expense.date instanceof Date ? expense.date.toISOString().slice(0, 10) : expense.date,
      description: expense.description || '',
      amount: Math.round(share),
      tripName: expense.trip?.name || '',
      tripId,
      category,
      tags: expense.tags ?? [],
    };
    allDetails.push(detail);

    const categoryValue = categoryMap.get(category) || { total: 0, count: 0, details: [] };
    categoryMap.set(category, {
      total: categoryValue.total + share,
      count: categoryValue.count + 1,
      details: [...categoryValue.details, detail],
    });

    if (tripId) {
      const tripValue = tripMap.get(tripId) || {
        tripName: expense.trip?.name || '',
        total: 0,
        count: 0,
        details: [],
      };
      tripMap.set(tripId, {
        ...tripValue,
        total: tripValue.total + share,
        count: tripValue.count + 1,
        details: [...tripValue.details, detail],
      });
    }

    for (const tag of expense.tags ?? []) {
      const tagValue = tagMap.get(tag) || { total: 0, count: 0, details: [] };
      tagMap.set(tag, {
        total: tagValue.total + share,
        count: tagValue.count + 1,
        details: [...tagValue.details, detail],
      });
    }
  }

  const sortDetails = (details: ExpenseDetail[]) =>
    details.sort((a, b) => b.date.localeCompare(a.date));
  const categoryStats: CategoryStat[] = Array.from(categoryMap, ([category, value]) => ({
    category,
    total: Math.round(value.total),
    count: value.count,
    details: sortDetails(value.details),
  })).sort((a, b) => b.total - a.total);
  const tripStats: PersonalTripStat[] = Array.from(tripMap, ([tripId, value]) => ({
    tripId,
    tripName: value.tripName,
    total: Math.round(value.total),
    count: value.count,
    details: sortDetails(value.details),
  })).sort((a, b) => b.total - a.total);
  const tagStats: TagStat[] = Array.from(tagMap, ([tag, value]) => ({
    tag,
    total: Math.round(value.total),
    count: value.count,
    details: sortDetails(value.details),
  })).sort((a, b) => b.total - a.total);

  return {
    categoryStats,
    tripStats,
    tagStats,
    totalAmount: categoryStats.reduce((sum, category) => sum + category.total, 0),
    totalExpenses: expenses.length,
    tripCount: tripStats.length,
    recentExpenses: sortDetails(allDetails),
  };
}

function emptyStats(startDate?: string, endDate?: string): StatsData {
  return {
    categoryStats: [],
    tripStats: [],
    tagStats: [],
    totalAmount: 0,
    totalExpenses: 0,
    tripCount: 0,
    dailyAverage: 0,
    dayCount: inclusiveDayCount(startDate, endDate),
    startDate: startDate || null,
    endDate: endDate || null,
    recentExpenses: [],
    comparison: null,
  };
}

/**
 * Get personal statistics
 */
export const getStats = withAuth(
  async (session, options: GetStatsOptions = {}): Promise<ActionResult<StatsData>> => {
    try {
      const { startDate, endDate, compare = false } = options;

      await dbConnect();

      // 1. Get all trips the user is part of
      const userTrips = await Trip.find({ 'members.user': session.userId })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();

      if (userTrips.length === 0) {
        return { success: true, data: emptyStats(startDate, endDate) };
      }

      const tripIds = userTrips.map((t) => t._id);

      // 查詢區間（分類統計依支出 date）
      const prior = compare ? previousPeriod(startDate, endDate) : null;
      const rangeStart = prior
        ? new Date(`${prior.startDate}T00:00:00.000Z`)
        : startDate
          ? new Date(`${startDate}T00:00:00.000Z`)
          : null;
      const rangeEnd = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

      // 2. Get expenses where the user is in the splits（含內嵌 splits）
      const dateFilter: Record<string, Date> = {};
      if (rangeStart) dateFilter.$gte = rangeStart;
      if (rangeEnd) dateFilter.$lte = rangeEnd;

      const expenses = await Expense.find({
        trip: { $in: tripIds },
        'splits.user': session.userId,
        ...(rangeStart || rangeEnd ? { date: dateFilter } : {}),
      })
        .select('category date description splits trip tags')
        .populate('trip', 'name')
        .lean<LeanStatExpense[]>();

      const isCurrent = (expense: LeanStatExpense) => {
        const value = dateOnly(expense.date);
        return (!startDate || value >= startDate) && (!endDate || value <= endDate);
      };
      const current = aggregatePersonalStats(expenses.filter(isCurrent), session.userId);
      const dayCount =
        inclusiveDayCount(startDate, endDate) ||
        (current.recentExpenses.length
          ? inclusiveDayCount(
              current.recentExpenses.at(-1)?.date,
              current.recentExpenses.at(0)?.date
            )
          : 0);
      let comparison: StatsComparison | null = null;
      if (prior) {
        const previous = aggregatePersonalStats(
          expenses.filter((expense) => {
            const value = dateOnly(expense.date);
            return value >= prior.startDate && value <= prior.endDate;
          }),
          session.userId
        );
        comparison = {
          startDate: prior.startDate,
          endDate: prior.endDate,
          totalAmount: previous.totalAmount,
          totalExpenses: previous.totalExpenses,
          dailyAverage: prior.days ? Math.round(previous.totalAmount / prior.days) : 0,
          categoryStats: previous.categoryStats,
          tripStats: previous.tripStats,
          tagStats: previous.tagStats,
        };
      }

      return {
        success: true,
        data: {
          ...current,
          dailyAverage: dayCount ? Math.round(current.totalAmount / dayCount) : 0,
          dayCount,
          startDate: startDate || current.recentExpenses.at(-1)?.date || null,
          endDate: endDate || current.recentExpenses.at(0)?.date || null,
          comparison,
        },
      };
    } catch (error) {
      logger.error('Get stats error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Group (whole-trip) statistics — unlike getStats this is per-trip and NOT
 * filtered by splits.user: amounts are the full expense, plus a payer/share
 * ranking and average-per-person-per-day. Heavy lifting is the pure
 * computeTripStats; this only authorizes + loads (one trip + its expenses).
 */
export const getTripStats = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<TripStatsData>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const { tripId } = membership;

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
      return { success: true, data: computeTripStats(mapped, members, range, mappedDays) };
    } catch (error) {
      logger.error('Get trip stats error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
