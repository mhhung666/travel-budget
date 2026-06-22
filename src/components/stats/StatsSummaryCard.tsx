'use client';

import { Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsSummaryCardProps {
  totalAmount: number;
  totalExpenses: number;
  formatCurrency: (amount: number) => string;
  t: (key: string) => string;
}

export default function StatsSummaryCard({
  totalAmount,
  totalExpenses,
  formatCurrency,
  t,
}: StatsSummaryCardProps) {
  return (
    <Card className="relative h-full overflow-hidden rounded-2xl border-none bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg">
      {/* 裝飾性背景圖形 */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

      <CardContent className="relative z-10 flex h-full flex-col justify-center p-5 sm:p-6">
        <div className="mb-1.5 flex items-center gap-2 opacity-90">
          <Wallet size={16} />
          <span className="text-sm font-medium">{t('totalSpent')}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {formatCurrency(totalAmount)}
          </span>
          <span className="text-sm font-medium opacity-90">
            · {totalExpenses} {t('expenses')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
