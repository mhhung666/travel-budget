import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

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
      next: { revalidate: 3600 }, // Next.js 缓存 1 小时
    });

    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }

    const data = await response.json();

    // API 以 TWD 為基準回傳「1 TWD = ? 外幣」；我們要的是「1 外幣 = ? TWD」故取倒數。
    // 回傳全部幣別（不再只挑 6 種），支援任意 ISO 4217 幣別的即時匯率。
    const rates: Record<string, number> = { TWD: 1 };
    for (const [code, value] of Object.entries((data.rates ?? {}) as Record<string, number>)) {
      const r = Number(value);
      if (Number.isFinite(r) && r > 0) rates[code] = 1 / r;
    }
    rates.TWD = 1;

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
    logger.error('Error fetching exchange rates', error);

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
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch exchange rates',
        rates: {
          TWD: 1,
          JPY: 0.22, // 大约的默认值
          USD: 31.5,
          EUR: 34.5,
          HKD: 4.0,
          THB: 0.9,
        },
        fallback: true,
      },
      { status: 500 }
    );
  }
}
