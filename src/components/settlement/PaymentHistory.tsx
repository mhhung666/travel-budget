'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Plus, Trash2, ReceiptText } from 'lucide-react';
import type { PaymentRecord } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PaymentHistoryProps {
  payments: PaymentRecord[];
  /** 是否為成員（可登記／刪除）。公開分享檢視為 false，純唯讀。 */
  canManage: boolean;
  onRecord: () => void;
  onDelete: (id: string) => void;
}

/**
 * 已登記還款的歷史清單。結算餘額已把這些款項淨額抵銷；此處讓使用者看見、
 * 補登（含計畫外／部分還款）與刪除。
 */
export default function PaymentHistory({
  payments,
  canManage,
  onRecord,
  onDelete,
}: PaymentHistoryProps) {
  const t = useTranslations('settlement');
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-muted-foreground" />
          {t('paymentHistory')}
          {payments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({payments.length})</span>
          )}
        </CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" className="gap-1" onClick={onRecord}>
            <Plus className="h-4 w-4" />
            {t('recordPayment')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {t('paymentHistoryEmpty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{p.fromName}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.toName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dateFmt.format(new Date(p.createdAt))}
                    {p.note ? ` · ${p.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    NT${p.amount.toLocaleString()}
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(p.id)}
                      aria-label={t('deletePayment')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
