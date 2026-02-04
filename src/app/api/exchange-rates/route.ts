import { NextResponse } from 'next/server';

// 汇率数据缓存（避免频繁请求）
let cachedRates: { rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1小时

/**
 * GET /api/exchange-rates
 * 获取相对于 TWD 的汇率
 */
export async function GET() {
  try {
    // 检查缓存
    if (cachedRates && Date.now() - cachedRates.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        rates: cachedRates.rates,
        cached: true,
      });
    }

    // 获取最新汇率
    // 使用 ExchangeRate-API 免费服务
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/TWD', {
      next: { revalidate: 3600 } // Next.js 缓存 1 小时
    });

    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }

    const data = await response.json();

    // 我们需要的是其他货币对 TWD 的汇率
    // API 返回的是 TWD 对其他货币的汇率，需要取倒数
    const rates: Record<string, number> = {
      TWD: 1,
      JPY: 1 / (data.rates.JPY || 1),
      USD: 1 / (data.rates.USD || 1),
      EUR: 1 / (data.rates.EUR || 1),
      HKD: 1 / (data.rates.HKD || 1),
    };

    // 更新缓存
    cachedRates = {
      rates,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      success: true,
      rates,
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);

    // 如果有缓存数据，即使过期也返回
    if (cachedRates) {
      return NextResponse.json({
        success: true,
        rates: cachedRates.rates,
        cached: true,
        stale: true,
      });
    }

    // 返回默认汇率（作为后备方案）
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch exchange rates',
      rates: {
        TWD: 1,
        JPY: 0.22, // 大约的默认值
        USD: 31.5,
        EUR: 34.5,
        HKD: 4.0,
      },
      fallback: true,
    }, { status: 500 });
  }
}
