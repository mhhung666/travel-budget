'use server';

import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { StatsData, CategoryStat, CountryStat, ExpenseDetail, Location } from '@/types';
import { logger } from '@/lib/logger';

interface GetStatsOptions {
  startDate?: string;
  endDate?: string;
}

type LeanStatExpense = {
  _id: { toString(): string };
  category: string | null;
  date: Date;
  description: string;
  splits: { user: { toString(): string }; shareAmount: number }[];
  trip: { name: string } | null;
};

/**
 * Get personal statistics
 */
export const getStats = withAuth(
  async (session, options: GetStatsOptions = {}): Promise<ActionResult<StatsData>> => {
    try {
      const { startDate, endDate } = options;

      await dbConnect();

      // 1. Get all trips the user is part of
      const userTrips = await Trip.find({ 'members.user': session.userId })
        .select('_id location')
        .lean<{ _id: Types.ObjectId; location: Location | null }[]>();

      if (userTrips.length === 0) {
        return {
          success: true,
          data: { categoryStats: [], countries: [], totalAmount: 0, totalExpenses: 0 },
        };
      }

      const tripIds = userTrips.map((t) => t._id);

      // 2. Get expenses where the user is in the splits（含內嵌 splits）
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(`${endDate}T23:59:59.999Z`);

      const expenses = await Expense.find({
        trip: { $in: tripIds },
        'splits.user': session.userId,
        ...(startDate || endDate ? { date: dateFilter } : {}),
      })
        .select('category date description splits trip')
        .populate('trip', 'name')
        .lean<LeanStatExpense[]>();

      // 3. Calculate category statistics（只計算自己分攤的金額）
      const categoryMap = new Map<
        string,
        { total: number; count: number; details: ExpenseDetail[] }
      >();

      for (const e of expenses) {
        const mySplit = e.splits.find((s) => s.user.toString() === session.userId);
        const share = mySplit?.shareAmount || 0;
        const category = e.category || 'other';
        const current = categoryMap.get(category) || { total: 0, count: 0, details: [] };

        const detail: ExpenseDetail = {
          id: e._id.toString(),
          date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : e.date,
          description: e.description || '',
          amount: Math.round(share),
          tripName: e.trip?.name || '',
        };

        categoryMap.set(category, {
          total: current.total + share,
          count: current.count + 1,
          details: [...current.details, detail],
        });
      }

      const categoryStats: CategoryStat[] = Array.from(categoryMap.entries())
        .map(([category, stats]) => ({
          category,
          total: Math.round(stats.total),
          count: stats.count,
          details: stats.details.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          ),
        }))
        .sort((a, b) => b.total - a.total);

      // 4. Calculate country statistics from trip locations
      const countryMap = new Map<
        string,
        {
          country_code: string;
          regions: Map<string, { tripCount: number; names?: Record<string, string> }>;
          tripCount: number;
        }
      >();

      for (const trip of userTrips) {
        const location = trip.location;
        if (location && location.country) {
          const country = location.country;
          const countryCode = location.country_code || '';
          const regionName = location.name || '未知';

          if (!countryMap.has(country)) {
            countryMap.set(country, {
              country_code: countryCode,
              regions: new Map(),
              tripCount: 0,
            });
          }

          const countryData = countryMap.get(country)!;
          countryData.tripCount += 1;
          const region = countryData.regions.get(regionName);
          if (region) {
            region.tripCount += 1;
          } else {
            // 第一次見到此地區時記下其多語名（建立旅行時存的 location.names）
            countryData.regions.set(regionName, { tripCount: 1, names: location.names });
          }
        }
      }

      const countries: CountryStat[] = Array.from(countryMap.entries())
        .map(([country, data]) => ({
          country,
          country_code: data.country_code,
          tripCount: data.tripCount,
          regions: Array.from(data.regions.entries())
            .map(([name, region]) => ({
              name,
              names: region.names,
              tripCount: region.tripCount,
            }))
            .sort((a, b) => b.tripCount - a.tripCount),
        }))
        .sort((a, b) => b.tripCount - a.tripCount);

      // 5. Totals
      const totalAmount = categoryStats.reduce((sum, cat) => sum + cat.total, 0);
      const totalExpenses = categoryStats.reduce((sum, cat) => sum + cat.count, 0);

      return {
        success: true,
        data: { categoryStats, countries, totalAmount, totalExpenses },
      };
    } catch (error) {
      logger.error('Get stats error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
