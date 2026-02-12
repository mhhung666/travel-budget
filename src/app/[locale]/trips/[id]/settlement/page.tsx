'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Balance, Transaction } from '@/types';
import { getCurrentUser, getSettlement } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import {
  SettlementSummary,
  SettlementBalances,
  SettlementPlan,
} from '@/components/settlement';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tSettlement = useTranslations('settlement');
  const tError = useTranslations('error');

  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [currentUser, setCurrentUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ TWD: 1 });
  const [loadingRates, setLoadingRates] = useState(false);

  useEffect(() => {
    loadSettlement();
    loadExchangeRates();
  }, [tripId]);

  const loadExchangeRates = async () => {
    try {
      setLoadingRates(true);
      const response = await fetch('/api/exchange-rates');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.rates) {
          setExchangeRates(data.rates);
        }
      }
    } catch (err) {
      console.error('Failed to load exchange rates:', err);
    } finally {
      setLoadingRates(false);
    }
  };

  const loadSettlement = async () => {
    try {
      // 嘗試檢查認證
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        setCurrentUser(userResult.data);
      }

      // 嘗試使用 Server Action
      if (userResult.success && userResult.data) {
        const result = await getSettlement(tripId);
        if (result.success) {
          setBalances(result.data.balances);
          setTransactions(result.data.transactions);
          setTotalExpenses(result.data.totalExpenses);
          return;
        }
        // 如果不是成員，繼續使用公開 API
        if (result.code !== 'FORBIDDEN') {
          throw new Error(result.error);
        }
      }

      // 未登入或非成員，使用公開 API
      const response = await fetch(`/api/public/trips/${tripId}/settlement`);

      if (!response.ok) {
        throw new Error(tError('loadSettlementFailed'));
      }

      const data = await response.json();
      setBalances(data.balances);
      setTransactions(data.transactions);
      setTotalExpenses(data.totalExpenses);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push(`/trips/${tripId}`)} size="lg">
            {tSettlement('backToTrip')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar
        user={
          currentUser
            ? {
              id: currentUser.id,
              username: currentUser.display_name,
              email: currentUser.email,
            }
            : null
        }
        showUserMenu={true}
        title={tSettlement('summary')}
      />

      <div className="container mx-auto max-w-6xl pt-24 px-4 sm:px-6">
        {/* 返回按鈕 */}
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground mb-6 -ml-2"
          onClick={() => router.push(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tSettlement('backToTrip')}
        </Button>

        {/* 總支出 */}
        <SettlementSummary totalExpenses={totalExpenses} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 每人統計 */}
          <SettlementBalances balances={balances} />

          {/* 結算方案 */}
          <SettlementPlan
            transactions={transactions}
            exchangeRates={exchangeRates}
            loadingRates={loadingRates}
          />
        </div>
      </div>
    </div>
  );
}
