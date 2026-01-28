'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import type { ActionResult } from './types';
import type { StatsData, CategoryStat, CountryStat, ExpenseDetail } from '@/types';

interface GetStatsOptions {
  startDate?: string;
  endDate?: string;
}

/**
 * Get personal statistics
 */
export async function getStats(options: GetStatsOptions = {}): Promise<ActionResult<StatsData>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const { startDate, endDate } = options;

    // 1. Get all trips the user is part of
    const { data: tripMembers, error: tripError } = await supabase
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', session.userId);

    if (tripError) throw tripError;

    const tripIds = tripMembers?.map((tm) => tm.trip_id) || [];

    if (tripIds.length === 0) {
      return {
        success: true,
        data: {
          categoryStats: [],
          countries: [],
          totalAmount: 0,
          totalExpenses: 0,
        },
      };
    }

    // 2. Get expense splits with details
    let expenseSplitsQuery = supabase
      .from('expense_splits')
      .select(
        `
        share_amount,
        expenses!inner (
          id,
          category,
          date,
          description,
          trip_id,
          trips!inner (
            name
          )
        )
      `
      )
      .eq('user_id', session.userId)
      .in('expenses.trip_id', tripIds);

    if (startDate) {
      expenseSplitsQuery = expenseSplitsQuery.gte('expenses.date', startDate);
    }
    if (endDate) {
      expenseSplitsQuery = expenseSplitsQuery.lte('expenses.date', endDate);
    }

    const { data: expenseSplits, error: splitsError } = await expenseSplitsQuery;

    if (splitsError) throw splitsError;

    // 3. Calculate category statistics
    const categoryMap = new Map<
      string,
      { total: number; count: number; details: ExpenseDetail[] }
    >();

    expenseSplits?.forEach((split: any) => {
      const category = split.expenses.category || 'other';
      const current = categoryMap.get(category) || { total: 0, count: 0, details: [] };

      const detail: ExpenseDetail = {
        id: split.expenses.id,
        date: split.expenses.date,
        description: split.expenses.description || '',
        amount: Math.round(split.share_amount || 0),
        tripName: split.expenses.trips?.name || '',
      };

      categoryMap.set(category, {
        total: current.total + (split.share_amount || 0),
        count: current.count + 1,
        details: [...current.details, detail],
      });
    });

    const categoryStats: CategoryStat[] = Array.from(categoryMap.entries()).map(
      ([category, stats]) => ({
        category,
        total: Math.round(stats.total),
        count: stats.count,
        details: stats.details.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      })
    );

    categoryStats.sort((a, b) => b.total - a.total);

    // 4. Get trip locations for country stats
    let tripsQuery = supabase.from('trips').select('id, location').in('id', tripIds);

    if (startDate) {
      tripsQuery = tripsQuery.or(`start_date.gte.${startDate},end_date.gte.${startDate}`);
    }
    if (endDate) {
      tripsQuery = tripsQuery.or(`start_date.lte.${endDate},end_date.lte.${endDate}`);
    }

    const { data: trips, error: tripsError } = await tripsQuery;

    if (tripsError) throw tripsError;

    // 5. Calculate country statistics
    const countryMap = new Map<
      string,
      { country_code: string; regions: Map<string, number>; tripCount: number }
    >();

    trips?.forEach((trip: any) => {
      if (trip.location && trip.location.country) {
        const country = trip.location.country;
        const countryCode = trip.location.country_code || '';
        const regionName = trip.location.name || '未知';

        if (!countryMap.has(country)) {
          countryMap.set(country, {
            country_code: countryCode,
            regions: new Map(),
            tripCount: 0,
          });
        }

        const countryData = countryMap.get(country)!;
        countryData.tripCount += 1;

        const currentRegionCount = countryData.regions.get(regionName) || 0;
        countryData.regions.set(regionName, currentRegionCount + 1);
      }
    });

    const countries: CountryStat[] = Array.from(countryMap.entries()).map(([country, data]) => ({
      country,
      country_code: data.country_code,
      tripCount: data.tripCount,
      regions: Array.from(data.regions.entries())
        .map(([name, tripCount]) => ({ name, tripCount }))
        .sort((a, b) => b.tripCount - a.tripCount),
    }));

    countries.sort((a, b) => b.tripCount - a.tripCount);

    // 6. Calculate totals
    const totalAmount = categoryStats.reduce((sum, cat) => sum + cat.total, 0);
    const totalExpenses = categoryStats.reduce((sum, cat) => sum + cat.count, 0);

    return {
      success: true,
      data: {
        categoryStats,
        countries,
        totalAmount,
        totalExpenses,
      },
    };
  } catch (error) {
    console.error('Get stats error:', error);
    return { success: false, error: '獲取統計資料失敗', code: 'INTERNAL_ERROR' };
  }
}
