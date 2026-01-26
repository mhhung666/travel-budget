import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

interface ExpenseDetail {
  id: number;
  date: string;
  description: string;
  amount: number; // 分帳後金額
  tripName: string;
}

interface CategoryStat {
  category: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

interface RegionStat {
  name: string;
  tripCount: number;
}

interface CountryStat {
  country: string;
  country_code: string;
  tripCount: number;
  regions: RegionStat[];
}

// 獲取個人統計資料
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // 1. 取得用戶參與的所有旅行
    const { data: tripMembers, error: tripError } = await supabase
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', session.userId);

    if (tripError) {
      console.error('Get trip members error:', tripError);
      return NextResponse.json({ error: '獲取旅行資料失敗' }, { status: 500 });
    }

    const tripIds = tripMembers?.map((tm) => tm.trip_id) || [];

    if (tripIds.length === 0) {
      return NextResponse.json({
        categoryStats: [],
        countries: [],
        totalAmount: 0,
        totalExpenses: 0,
      });
    }

    // 2. 取得用戶的分帳記錄和對應的支出資訊（包含明細）
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

    // 日期篩選
    if (startDate) {
      expenseSplitsQuery = expenseSplitsQuery.gte('expenses.date', startDate);
    }
    if (endDate) {
      expenseSplitsQuery = expenseSplitsQuery.lte('expenses.date', endDate);
    }

    const { data: expenseSplits, error: splitsError } = await expenseSplitsQuery;

    if (splitsError) {
      console.error('Get expense splits error:', splitsError);
      return NextResponse.json({ error: '獲取支出資料失敗' }, { status: 500 });
    }

    // 3. 計算分類統計（含明細）
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
        // 明細按日期排序（新的在前）
        details: stats.details.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      })
    );

    // 按金額排序
    categoryStats.sort((a, b) => b.total - a.total);

    // 4. 取得旅行的地點資訊來統計國家
    let tripsQuery = supabase.from('trips').select('id, location').in('id', tripIds);

    // 如果有日期篩選，也篩選旅行
    if (startDate) {
      tripsQuery = tripsQuery.or(`start_date.gte.${startDate},end_date.gte.${startDate}`);
    }
    if (endDate) {
      tripsQuery = tripsQuery.or(`start_date.lte.${endDate},end_date.lte.${endDate}`);
    }

    const { data: trips, error: tripsError } = await tripsQuery;

    if (tripsError) {
      console.error('Get trips error:', tripsError);
      return NextResponse.json({ error: '獲取旅行地點失敗' }, { status: 500 });
    }

    // 5. 統計國家和地區
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

    const countries: CountryStat[] = Array.from(countryMap.entries()).map(
      ([country, data]) => ({
        country,
        country_code: data.country_code,
        tripCount: data.tripCount,
        regions: Array.from(data.regions.entries())
          .map(([name, tripCount]) => ({ name, tripCount }))
          .sort((a, b) => b.tripCount - a.tripCount),
      })
    );

    // 按旅行次數排序
    countries.sort((a, b) => b.tripCount - a.tripCount);

    // 6. 計算總計
    const totalAmount = categoryStats.reduce((sum, cat) => sum + cat.total, 0);
    const totalExpenses = categoryStats.reduce((sum, cat) => sum + cat.count, 0);

    return NextResponse.json({
      categoryStats,
      countries,
      totalAmount,
      totalExpenses,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json({ error: '獲取統計資料失敗' }, { status: 500 });
  }
}
