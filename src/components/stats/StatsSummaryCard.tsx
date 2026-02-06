'use client';

import {
  Wallet,
  Receipt,
} from 'lucide-react';
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
    <Card
      className="bg-gradient-to-br from-indigo-500 to-violet-500 border-none shadow-xl text-white h-full relative overflow-hidden rounded-3xl"
    >
      {/* 裝飾性背景圖形 */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl"
      />

      <CardContent className="relative z-10 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2 opacity-90">
          <Wallet size={20} />
          <span className="text-lg font-medium">
            {t('totalSpent')}
          </span>
        </div>
        <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">
          {formatCurrency(totalAmount)}
        </h2>
        <div className="flex items-center gap-2 opacity-90">
          <Receipt size={16} />
          <span className="text-sm font-medium">
            {totalExpenses} {t('expenses')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
