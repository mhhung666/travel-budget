'use client';

import { TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Balance } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SettlementBalancesProps {
  balances: Balance[];
  avatarUrlById?: Record<string, string | null>;
}

export default function SettlementBalances({ balances, avatarUrlById }: SettlementBalancesProps) {
  const t = useTranslations('settlement');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('perPerson')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {balances.map((balance) => (
            <Card key={balance.userId} className="shadow-sm border-muted">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 bg-primary">
                      <AvatarImage
                        src={avatarUrlById?.[balance.userId] ?? ''}
                        alt={balance.username}
                      />
                      <AvatarFallback className="text-primary-foreground bg-primary">
                        {balance.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-base">{balance.username}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1 font-bold px-2 py-1 text-sm border-0 tabular-nums',
                      balance.balance > 0
                        ? 'bg-success/15 text-success'
                        : balance.balance < 0
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {balance.balance > 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : balance.balance < 0 ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {balance.balance >= 0 ? '+' : ''}${balance.balance.toFixed(0)}
                  </Badge>
                </div>

                <Separator className="my-3" />

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('totalPaid')}</span>
                    <span className="font-medium tabular-nums">
                      ${balance.totalPaid.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('totalOwed')}</span>
                    <span className="font-medium tabular-nums">
                      ${balance.totalOwed.toLocaleString()}
                    </span>
                  </div>
                  <Separator className="my-1.5" />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{t('status')}</span>
                    <span
                      className={cn(
                        'font-semibold',
                        balance.balance > 0
                          ? 'text-success'
                          : balance.balance < 0
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      )}
                    >
                      {balance.balance > 0
                        ? t('shouldReceive')
                        : balance.balance < 0
                          ? t('shouldPay')
                          : t('settled')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
