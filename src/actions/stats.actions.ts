'use server';

import { Types, type PipelineStage } from 'mongoose';
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
  StatsExpenseFilters,
  StatsExpensePage,
  StatsExpenseSort,
  TimeInterval,
  TripStatsData,
} from '@/types';
import { logger } from '@/lib/logger';
import { generateStatsInsights, STATS_INSIGHT_RULE_VERSION } from '@/lib/statsInsights';
import { aggregateTimeline, resolveTimelineInterval } from '@/lib/histogram';
import { decodeStatsExpenseCursor, encodeStatsExpenseCursor } from '@/lib/statsExpenseCursor';
import { buildStatsExpensePagePipeline } from '@/lib/statsExpenseQuery';
import {
  toTripStatsInputs,
  type TripStatExpenseInput,
  type TripStatsTripInput,
  type TripStatsDayInput,
} from '@/lib/dto';

interface GetStatsOptions {
  startDate?: string;
  endDate?: string;
  timelineInterval?: TimeInterval;
  timelineFilters?: {
    tripId?: string;
    category?: string;
    tag?: string;
    expenseId?: string;
  };
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

type StatsAggregate = {
  categoryStats: CategoryStat[];
  tripStats: PersonalTripStat[];
  tagStats: TagStat[];
  totalAmount: number;
  totalExpenses: number;
  tripCount: number;
  recentExpenses: ExpenseDetail[];
};

export interface GetStatsExpensePageOptions {
  startDate?: string;
  endDate?: string;
  filters?: StatsExpenseFilters;
  sort?: StatsExpenseSort;
  cursor?: string;
}

const STATS_EXPENSE_PAGE_SIZE = 20;

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
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

function emptyStats(options: GetStatsOptions = {}): StatsData {
  const { startDate, endDate, timelineInterval = 'day' } = options;
  const resolvedInterval =
    startDate && endDate
      ? resolveTimelineInterval(startDate, endDate, timelineInterval)
      : timelineInterval;
  return {
    categoryStats: [],
    tripStats: [],
    tagStats: [],
    totalAmount: 0,
    totalExpenses: 0,
    tripCount: 0,
    averagePerTrip: 0,
    startDate: startDate || null,
    endDate: endDate || null,
    timeline:
      startDate && endDate
        ? aggregateTimeline([], resolvedInterval, startDate, endDate)
        : {
            interval: resolvedInterval,
            dataPoints: [],
            totalAmount: 0,
            totalCount: 0,
          },
    insights: [],
    insightRuleVersion: STATS_INSIGHT_RULE_VERSION,
  };
}

/**
 * Get personal statistics
 */
export const getStats = withAuth(
  async (session, options: GetStatsOptions = {}): Promise<ActionResult<StatsData>> => {
    try {
      const { startDate, endDate, timelineInterval = 'day', timelineFilters = {} } = options;

      await dbConnect();

      // 1. Get all trips the user is part of
      const userTrips = await Trip.find({ 'members.user': session.userId })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();

      if (userTrips.length === 0) {
        return { success: true, data: emptyStats(options) };
      }

      const tripIds = userTrips.map((t) => t._id);

      // 查詢區間（分類統計依支出 date）
      const rangeStart = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
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
      const insights = generateStatsInsights({ tripStats: current.tripStats });
      const effectiveStart = startDate || current.recentExpenses.at(-1)?.date || '';
      const effectiveEnd = endDate || current.recentExpenses.at(0)?.date || '';
      const timelineExpenses = current.recentExpenses.filter(
        (detail) =>
          (!timelineFilters.tripId || detail.tripId === timelineFilters.tripId) &&
          (!timelineFilters.category || detail.category === timelineFilters.category) &&
          (!timelineFilters.tag || detail.tags?.includes(timelineFilters.tag)) &&
          (!timelineFilters.expenseId || detail.id === timelineFilters.expenseId)
      );
      const timeline =
        effectiveStart && effectiveEnd
          ? aggregateTimeline(
              timelineExpenses,
              resolveTimelineInterval(effectiveStart, effectiveEnd, timelineInterval),
              effectiveStart,
              effectiveEnd
            )
          : {
              interval: timelineInterval,
              dataPoints: [],
              totalAmount: 0,
              totalCount: 0,
            };
      return {
        success: true,
        data: {
          categoryStats: current.categoryStats.map(({ details: _details, ...stat }) => stat),
          tripStats: current.tripStats.map(({ details: _details, ...stat }) => stat),
          tagStats: current.tagStats.map(({ details: _details, ...stat }) => stat),
          totalAmount: current.totalAmount,
          totalExpenses: current.totalExpenses,
          tripCount: current.tripCount,
          averagePerTrip: current.tripCount
            ? Math.round(current.totalAmount / current.tripCount)
            : 0,
          startDate: effectiveStart || null,
          endDate: effectiveEnd || null,
          timeline,
          insights,
          insightRuleVersion: STATS_INSIGHT_RULE_VERSION,
        },
      };
    } catch (error) {
      logger.error('Get stats error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Cursor-paginated personal expense details. Filtering and sorting happen in
 * MongoDB so the statistics response never needs to carry an unbounded detail list.
 */
export const getStatsExpensePage = withAuth(
  async (
    session,
    options: GetStatsExpensePageOptions = {}
  ): Promise<ActionResult<StatsExpensePage>> => {
    try {
      const {
        startDate,
        endDate,
        filters = {},
        sort = 'dateDesc',
        cursor: encodedCursor,
      } = options;
      const cursor = encodedCursor ? decodeStatsExpenseCursor(encodedCursor, sort) : null;
      if (encodedCursor && !cursor) {
        return { success: false, error: 'INVALID_CURSOR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const userTrips = await Trip.find({ 'members.user': session.userId })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();
      if (!userTrips.length) {
        return { success: true, data: { items: [], nextCursor: null } };
      }

      const allowedTripIds = userTrips.map((trip) => trip._id);
      if (
        (filters.tripId && !Types.ObjectId.isValid(filters.tripId)) ||
        (filters.expenseId && !Types.ObjectId.isValid(filters.expenseId))
      ) {
        return { success: true, data: { items: [], nextCursor: null } };
      }

      const dateStart = filters.periodStart || startDate;
      const dateEnd = filters.periodEnd || endDate;
      const match: Record<string, unknown> = {
        trip: filters.tripId
          ? {
              $in: allowedTripIds.filter((tripId) => tripId.equals(filters.tripId)),
            }
          : { $in: allowedTripIds },
        'splits.user': new Types.ObjectId(session.userId),
      };
      if (filters.expenseId) match._id = new Types.ObjectId(filters.expenseId);
      if (filters.category) match.category = filters.category;
      if (filters.tag) match.tags = filters.tag;
      if (dateStart || dateEnd) {
        const date: Record<string, Date> = {};
        if (dateStart) date.$gte = new Date(`${dateStart}T00:00:00.000Z`);
        if (dateEnd) date.$lte = new Date(`${dateEnd}T23:59:59.999Z`);
        match.date = date;
      }

      const amountSort = sort === 'amountAsc' || sort === 'amountDesc';
      const pipeline: PipelineStage[] = buildStatsExpensePagePipeline({
        match,
        userId: new Types.ObjectId(session.userId),
        sort,
        cursor,
        pageSize: STATS_EXPENSE_PAGE_SIZE,
      });
      pipeline.push(
        {
          $lookup: {
            from: Trip.collection.name,
            localField: 'trip',
            foreignField: '_id',
            as: 'tripDocument',
          },
        },
        { $unwind: '$tripDocument' },
        {
          $project: {
            date: 1,
            description: 1,
            category: 1,
            tags: 1,
            trip: 1,
            shareAmount: '$splits.shareAmount',
            tripName: '$tripDocument.name',
          },
        }
      );

      type ExpensePageRow = {
        _id: Types.ObjectId;
        date: Date;
        description: string;
        category?: string;
        tags?: string[];
        trip: Types.ObjectId;
        shareAmount: number;
        tripName: string;
      };
      const rows = await Expense.aggregate<ExpensePageRow>(pipeline);
      const hasNextPage = rows.length > STATS_EXPENSE_PAGE_SIZE;
      const pageRows = rows.slice(0, STATS_EXPENSE_PAGE_SIZE);
      const last = pageRows.at(-1);
      const nextCursor =
        hasNextPage && last
          ? encodeStatsExpenseCursor({
              sort,
              value: amountSort ? last.shareAmount : last.date.toISOString(),
              id: last._id.toString(),
            })
          : null;

      return {
        success: true,
        data: {
          items: pageRows.map((row) => ({
            id: row._id.toString(),
            date: dateOnly(row.date),
            description: row.description || '',
            amount: Math.round(row.shareAmount),
            tripName: row.tripName || '',
            tripId: row.trip.toString(),
            category: row.category || 'other',
            tags: row.tags ?? [],
          })),
          nextCursor,
        },
      };
    } catch (error) {
      logger.error('Get stats expense page error', error);
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
