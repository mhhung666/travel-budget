'use client';

import { useTranslations } from 'next-intl';
import type { Balance } from '@/types';
import { Card, CardContent } from '@/components/ui/card';

interface SettlementSummaryProps {
  totalExpenses: number;
  /** 目前登入者的餘額；訪客（唯讀分享）或非成員時不傳，退回只顯示總支出。 */
  myBalance?: Balance | null;
}

/**
 * 結算摘要（UI/UX 重設計 5.4 —— 以我為中心）：
 * 頁首先講「你應收／應付多少」，總支出退居次要；其他成員的餘額表與
 * 轉帳方案往下排。沒有「我」（未登入的分享檢視）時維持總支出為主角。
 */
export default function SettlementSummary({ totalExpenses, myBalance }: SettlementSummaryProps) {
  const t = useTranslations('settlement');

  if (!myBalance) {
    return (
      <Card className="mb-6 bg-brand-gradient border-none shadow-lg">
        <CardContent className="pt-6 text-white text-center sm:text-left">
          <h3 className="text-lg font-semibold opacity-90 mb-1">{t('totalExpenses')}</h3>
          <p className="text-4xl font-bold tracking-tight tabular-nums">
            ${totalExpenses.toLocaleString()}
          </p>
        </CardContent>
      </Card>
    );
  }

  const settled = Math.abs(myBalance.balance) < 0.01;
  const statusLabel = settled
    ? t('youSettled')
    : myBalance.balance > 0
      ? t('youReceive')
      : t('youPay');

  return (
    <Card className="mb-6 bg-brand-gradient border-none shadow-lg">
      <CardContent className="flex flex-col gap-4 pt-6 text-white sm:flex-row sm:items-end sm:justify-between">
        <div className="text-center sm:text-left">
          <h3 className="mb-1 text-lg font-semibold opacity-90">{statusLabel}</h3>
          <p className="text-4xl font-bold tracking-tight tabular-nums">
            {settled ? '🎉' : `$${Math.round(Math.abs(myBalance.balance)).toLocaleString()}`}
          </p>
          <p className="mt-2 text-sm opacity-80 tabular-nums">
            {t('totalPaid')} ${myBalance.totalPaid.toLocaleString()} · {t('totalOwed')} $
            {myBalance.totalOwed.toLocaleString()}
          </p>
        </div>
        <div className="text-center sm:text-right">
          <p className="text-sm opacity-80">{t('totalExpenses')}</p>
          <p className="text-xl font-semibold tabular-nums">${totalExpenses.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
