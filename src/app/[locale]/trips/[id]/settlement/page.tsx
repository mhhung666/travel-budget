'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import {
  SettlementSummary,
  SettlementBalances,
  SettlementPlan,
} from '@/components/settlement';
import { useCurrentUser, useSettlement, useExchangeRates } from '@/hooks/queries';
import { SettlementSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tSettlement = useTranslations('settlement');
  const tError = useTranslations('error');

  const { data: currentUser } = useCurrentUser();
  const {
    data: settlement = { balances: [], transactions: [], totalExpenses: 0 },
    isLoading: loading,
    isError,
  } = useSettlement(tripId);
  const { data: exchangeRates = { TWD: 1 }, isFetching: loadingRates } = useExchangeRates();

  const { balances, transactions, totalExpenses } = settlement;
  const error = isError ? tError('loadSettlementFailed') : '';

  if (loading) {
    return <SettlementSkeleton />;
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
