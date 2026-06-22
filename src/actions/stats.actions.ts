'use server';

import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { StatsData, CategoryStat, ExpenseDetail } from '@/types';
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
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();

      if (userTrips.length === 0) {
        return {
          success: true,
          data: { categoryStats: [], totalAmount: 0, totalExpenses: 0 },
        };
      }

      const tripIds = userTrips.map((t) => t._id);

      // 查詢區間（分類統計依支出 date）
      const rangeStart = startDate ? new Date(startDate) : null;
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

      // 4. Totals
      const totalAmount = categoryStats.reduce((sum, cat) => sum + cat.total, 0);
      const totalExpenses = categoryStats.reduce((sum, cat) => sum + cat.count, 0);

      return {
        success: true,
        data: { categoryStats, totalAmount, totalExpenses },
      };
    } catch (error) {
      logger.error('Get stats error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
