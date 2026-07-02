'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  ArrowDown,
  Lightbulb,
  Check,
  BellRing,
  Loader2,
  PartyPopper,
} from 'lucide-react';
import type { Transaction } from '@/types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common';

interface SettlementPlanProps {
  transactions: Transaction[];
  exchangeRates: Record<string, number>;
  loadingRates: boolean;
  /** 成員專屬：點擊建議轉帳的「標記已付」時觸發（登記一筆還款）。未傳即唯讀。 */
  onMarkPaid?: (transaction: Transaction) => void;
  /** name → 頭像 URL（結算方案只帶名字，故以名字對應）。 */
  avatarUrlByName?: Record<string, string | null>;
  /** 當事人（被欠款者）按下「提醒還款」時觸發，對該筆轉帳的付款人寄出提醒。未傳即不顯示。 */
  onRemind?: (transaction: Transaction) => void;
  /** 目前登入者顯示名——只有當其為某筆轉帳的「收款人」時才顯示提醒按鈕。 */
  currentUserName?: string;
  /** 正在寄送提醒的轉帳鍵（`${from}__${to}`），用於該列按鈕的 loading 狀態。 */
  remindingKey?: string | null;
}

export default function SettlementPlan({
  transactions,
  exchangeRates,
  loadingRates,
  onMarkPaid,
  avatarUrlByName,
  onRemind,
  currentUserName,
  remindingKey,
}: SettlementPlanProps) {
  const t = useTranslations('settlement');
  const [selectedCurrency, setSelectedCurrency] = useState('TWD');

  const convertAmount = (amount: number): number => {
    if (selectedCurrency === 'TWD') return amount;
    const rate = exchangeRates[selectedCurrency];
    return rate ? amount / rate : amount;
  };

  const formatAmount = (amount: number): string => {
    const converted = convertAmount(amount);
    return converted.toFixed(selectedCurrency === 'JPY' ? 0 : 2);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex flex-col">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            {t('plan')}
            {transactions.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({transactions.length} {t('transferCount')})
              </span>
            )}
          </CardTitle>
        </div>
        <div className="w-[120px]">
          <Label className="sr-only">{t('currency')}</Label>
          <Select
            value={selectedCurrency}
            onValueChange={setSelectedCurrency}
            disabled={loadingRates}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={t('currency')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TWD">TWD</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="HKD">HKD</SelectItem>
              <SelectItem value="THB">THB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title={t('great')}
            description={t('noTransfers')}
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              {transactions.map((transaction, index) => (
                <div key={index} className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
                    {/* Payer */}
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                      <Avatar className="h-10 w-10 border-2 border-destructive/30 bg-destructive/10">
                        <AvatarImage
                          src={avatarUrlByName?.[transaction.from] ?? ''}
                          alt={transaction.from}
                        />
                        <AvatarFallback className="text-destructive font-bold bg-transparent">
                          {transaction.from.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('payer')}</p>
                        <p className="font-semibold text-foreground">
                          {transaction.from}
                          {currentUserName && transaction.from === currentUserName && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              ({t('you')})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Amount & Arrow */}
                    <div className="text-center my-2 sm:my-0 flex-1">
                      <p className="text-lg font-bold tabular-nums text-warning">
                        {selectedCurrency} {formatAmount(transaction.amount)}
                      </p>
                      {selectedCurrency !== 'TWD' && (
                        <p className="text-xs text-muted-foreground">
                          (TWD ${transaction.amount.toFixed(0)})
                        </p>
                      )}
                      <div className="flex justify-center mt-1 text-muted-foreground/50">
                        <ArrowDown className="sm:hidden h-5 w-5" />
                        <ArrowRight className="hidden sm:block h-5 w-5" />
                      </div>
                    </div>

                    {/* Payee */}
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{t('payee')}</p>
                        <p className="font-semibold text-foreground">
                          {transaction.to}
                          {currentUserName && transaction.to === currentUserName && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              ({t('you')})
                            </span>
                          )}
                        </p>
                      </div>
                      <Avatar className="h-10 w-10 border-2 border-success/30 bg-success/10">
                        <AvatarImage
                          src={avatarUrlByName?.[transaction.to] ?? ''}
                          alt={transaction.to}
                        />
                        <AvatarFallback className="text-success font-bold bg-transparent">
                          {transaction.to.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  {(() => {
                    // 當事人（被欠款者）才看得到提醒按鈕：自己是這筆轉帳的收款人時。
                    const canRemind =
                      !!onRemind && !!currentUserName && transaction.to === currentUserName;
                    const reminding = remindingKey === `${transaction.from}__${transaction.to}`;
                    if (!onMarkPaid && !canRemind) return null;
                    return (
                      <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-warning/20 pt-3">
                        {onMarkPaid && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-success/40 text-success hover:bg-success/10 hover:text-success"
                            onClick={() => onMarkPaid(transaction)}
                          >
                            <Check className="h-4 w-4" />
                            {t('markPaid')}
                          </Button>
                        )}
                        {canRemind && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reminding}
                            className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                            onClick={() => onRemind!(transaction)}
                          >
                            {reminding ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BellRing className="h-4 w-4" />
                            )}
                            {t('remind')}
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            <Alert variant="info" className="mt-4">
              <Lightbulb className="h-4 w-4" />
              <AlertTitle className="ml-2">{t('tip')}</AlertTitle>
              <AlertDescription className="ml-2 mt-1 opacity-90">
                {t('tipContent')}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
