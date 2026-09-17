'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Balance } from '@/types';
import { formatCurrency } from '@/constants/currencies';
import { MONEY_EPSILON } from '@/lib/money';
import { Card, CardContent } from '@/components/ui/card';

interface SettlementSummaryProps {
  totalExpenses: number;
  /** 目前登入者的餘額；訪客（唯讀分享）或非成員時不傳，退回只顯示總支出。 */
  myBalance?: Balance | null;
  /** 是否有和我有關的還款紀錄——餘額歸零時才分得出「已結清」和「本來就不用轉帳」。 */
  hasMyPayments?: boolean;
}

/**
 * 結算摘要（UI/UX 重設計 5.4 —— 以我為中心）：
 * 頁首先講「你應收／應付多少」，總支出退居次要；其他成員的餘額表與
 * 轉帳方案往下排。沒有「我」（未登入的分享檢視）時維持總支出為主角。
 */
export default function SettlementSummary({
  totalExpenses,
  myBalance,
  hasMyPayments = false,
}: SettlementSummaryProps) {
  const t = useTranslations('settlement');
  const locale = useLocale();
  const money = (amount: number) => formatCurrency(amount, 'TWD', locale);

  if (!myBalance) {
    return (
      <Card className="mb-6 bg-brand-gradient border-none shadow-lg">
        <CardContent className="pt-6 text-white text-center sm:text-left">
          <h3 className="text-lg font-semibold opacity-90 mb-1">{t('totalExpenses')}</h3>
          <p className="text-4xl font-bold tracking-tight tabular-nums">{money(totalExpenses)}</p>
        </CardContent>
      </Card>
    );
  }

  // 與 calculateSettlement 同門檻：剛好一分也算要結清，否則這裡寫「已結清」、
  // 下方卻列出一筆一元以下的轉帳。
  const zero = Math.abs(myBalance.balance) < MONEY_EPSILON;
  // 餘額為零有三種意思：還沒記任何支出、本來就不用轉帳、還完款結清了；只有最後一種才慶祝。
  const noExpenses = zero && totalExpenses < MONEY_EPSILON && !hasMyPayments;
  const settled = zero && hasMyPayments;
  const statusLabel = noExpenses
    ? t('noExpensesTitle')
    : settled
      ? t('youSettled')
      : zero
        ? t('youNoTransfer')
        : myBalance.balance > 0
          ? t('youReceive')
          : t('youPay');
  const headline = noExpenses ? null : settled ? '🎉' : money(Math.abs(myBalance.balance));

  return (
    <Card className="mb-6 bg-brand-gradient border-none shadow-lg">
      <CardContent className="flex flex-col gap-4 pt-6 text-white sm:flex-row sm:items-end sm:justify-between">
        <div className="text-center sm:text-left">
          <h3 className="mb-1 text-lg font-semibold opacity-90">{statusLabel}</h3>
          {headline && <p className="text-4xl font-bold tracking-tight tabular-nums">{headline}</p>}
          <p className="mt-2 text-sm opacity-80 tabular-nums">
            {noExpenses
              ? t('noExpensesSummaryHint')
              : `${t('myPaid')} ${money(myBalance.totalPaid)} · ${t('myShare')} ${money(myBalance.totalOwed)}`}
          </p>
        </div>
        <div className="text-center sm:text-right">
          <p className="text-sm opacity-80">{t('totalExpenses')}</p>
          <p className="text-xl font-semibold tabular-nums">{money(totalExpenses)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
