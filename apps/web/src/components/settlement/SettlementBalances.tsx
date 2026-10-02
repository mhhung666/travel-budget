'use client';

import { TrendingUp, TrendingDown, CheckCircle, Minus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Balance } from '@/types';
import { formatCurrency } from '@/constants/currencies';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SettlementBalancesProps {
  balances: Balance[];
  avatarUrlById?: Record<string, string | null>;
  /** 目前登入者的 userId；有值時「我」的卡片排最前並加標記（5.4 以我為中心）。 */
  currentUserId?: string;
  /** 旅行是否有支出或還款；都沒有時餘額為 0 只代表「尚無分攤」，不標「已結清」也不顯示 `+NT$0`。 */
  hasActivity?: boolean;
}

export default function SettlementBalances({
  balances,
  avatarUrlById,
  currentUserId,
  hasActivity = true,
}: SettlementBalancesProps) {
  const t = useTranslations('settlement');
  const locale = useLocale();
  const money = (amount: number) => formatCurrency(amount, 'TWD', locale);

  const ordered = currentUserId
    ? [...balances].sort(
        (a, b) => Number(b.userId === currentUserId) - Number(a.userId === currentUserId)
      )
    : balances;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('perPerson')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 每人一列、分隔線隔開：不再卡片包卡片，讓金額成為視線焦點 */}
        <ul className="divide-y">
          {ordered.map((balance) => {
            const tone =
              balance.balance > 0
                ? 'text-success'
                : balance.balance < 0
                  ? 'text-destructive'
                  : 'text-muted-foreground';
            const StatusIcon =
              balance.balance > 0
                ? TrendingUp
                : balance.balance < 0
                  ? TrendingDown
                  : hasActivity
                    ? CheckCircle
                    : Minus;
            return (
              <li
                key={balance.userId}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0 bg-primary">
                    <AvatarImage
                      src={avatarUrlById?.[balance.userId] ?? ''}
                      alt={balance.username}
                    />
                    <AvatarFallback className="text-primary-foreground bg-primary">
                      {balance.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{balance.username}</span>
                      {balance.userId === currentUserId && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                          {t('you')}
                        </Badge>
                      )}
                    </div>
                    {hasActivity && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t('totalPaid')} {money(balance.totalPaid)} · {t('totalOwed')}{' '}
                        {money(balance.totalOwed)}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn('shrink-0 text-right', tone)}>
                  {hasActivity && (
                    <p className="text-lg font-bold tabular-nums">
                      {balance.balance >= 0 ? '+' : ''}
                      {money(balance.balance)}
                    </p>
                  )}
                  <p className="flex items-center justify-end gap-1 text-xs font-medium">
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden />
                    {balance.balance > 0
                      ? t('shouldReceive')
                      : balance.balance < 0
                        ? t('shouldPay')
                        : hasActivity
                          ? t('settled')
                          : t('noShareYet')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
