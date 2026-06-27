'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import {
  SettlementSummary,
  SettlementBalances,
  SettlementPlan,
  PaymentHistory,
  RecordPaymentDialog,
  type PaymentMemberOption,
} from '@/components/settlement';
import { ExportMenu } from '@/components/export';
import {
  useCurrentUser,
  useMembers,
  useSettlement,
  useExchangeRates,
  useTrip,
  useTripMembership,
  usePaymentMutations,
} from '@/hooks/queries';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { exportSettlement, type ExportFormat } from '@/lib/exporters';
import type { Transaction } from '@/types';
import type { RecordPaymentInput } from '@/lib/validation';
import { SettlementSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tSettlement = useTranslations('settlement');
  const tError = useTranslations('error');
  const tExport = useTranslations('export');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: currentUser } = useCurrentUser();
  const { data: trip } = useTrip(tripId);
  const {
    data: settlement = { balances: [], transactions: [], payments: [], totalExpenses: 0 },
    isLoading: loading,
    isError,
  } = useSettlement(tripId);
  const { data: exchangeRates = { TWD: 1 }, isFetching: loadingRates } = useExchangeRates();
  const { isMember } = useTripMembership(tripId);
  const paymentMutations = usePaymentMutations(tripId);
  const { data: members = [] } = useMembers(tripId);

  const recordDialog = useDialog<{ fromId: string; toId: string; amount: number }>();
  const deletePaymentDialog = useDialog<string>();

  const { balances, transactions, payments, totalExpenses } = settlement;
  const error = isError ? tError('loadSettlementFailed') : '';

  // 建議轉帳只帶名字（calculateSettlement 不回 id）；用餘額表把名字對回 id 以預填登記表單。
  const memberOptions = useMemo<PaymentMemberOption[]>(
    () => balances.map((b) => ({ id: b.userId, name: b.username })),
    [balances]
  );
  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of balances) map.set(b.username, b.userId);
    return map;
  }, [balances]);

  // 成員頭像查表：每人統計用 userId；結算方案只帶名字，故另備 name → 頭像。
  const avatarById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.avatar_url ?? null])),
    [members]
  );
  const avatarByName = useMemo(
    () => Object.fromEntries(balances.map((b) => [b.username, avatarById[b.userId] ?? null])),
    [balances, avatarById]
  );

  const handleMarkPaid = (tx: Transaction) =>
    recordDialog.openDialog({
      fromId: nameToId.get(tx.from) ?? '',
      toId: nameToId.get(tx.to) ?? '',
      amount: tx.amount,
    });

  const openBlankRecord = () => {
    recordDialog.setData(null);
    recordDialog.openDialog();
  };

  const handleRecordSubmit = async (input: RecordPaymentInput) => {
    await paymentMutations.record.mutateAsync(input);
    toast({ title: tSettlement('paymentRecorded') });
  };

  const handleDeletePayment = (id: string) => deletePaymentDialog.openDialog(id);

  const confirmDeletePayment = async () => {
    const id = deletePaymentDialog.data;
    if (!id) return;
    try {
      await paymentMutations.remove.mutateAsync(id);
      deletePaymentDialog.closeDialog();
      toast({ title: tCommon('deleted') });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: tCommon('errorTitle'),
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const buildExport = (format: ExportFormat) =>
    exportSettlement({ balances, transactions, totalExpenses }, format, {
      heading: tExport('settlement.heading'),
      totalExpenses: tExport('settlement.totalExpenses'),
      balancesHeading: tExport('settlement.balancesHeading'),
      transfersHeading: tExport('settlement.transfersHeading'),
      noTransfers: tExport('settlement.noTransfers'),
      columns: {
        member: tExport('settlement.colMember'),
        paid: tExport('settlement.colPaid'),
        owed: tExport('settlement.colOwed'),
        balance: tExport('settlement.colBalance'),
      },
    });

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
                avatar_url: currentUser.avatar_url,
              }
            : null
        }
        showUserMenu={true}
        title={tSettlement('summary')}
      />

      <div className="container mx-auto max-w-6xl pt-24 px-4 sm:px-6">
        {/* 返回按鈕 + 匯出 */}
        <div className="flex justify-between items-center mb-6">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => router.push(`/trips/${tripId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tSettlement('backToTrip')}
          </Button>
          <ExportMenu
            build={buildExport}
            fileBaseName={`${trip?.name ?? 'trip'}-${tExport('settlement.heading')}`}
            disabled={balances.length === 0}
          />
        </div>

        {/* 總支出 */}
        <SettlementSummary totalExpenses={totalExpenses} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 每人統計 */}
          <SettlementBalances balances={balances} avatarUrlById={avatarById} />

          {/* 結算方案 */}
          <SettlementPlan
            transactions={transactions}
            exchangeRates={exchangeRates}
            loadingRates={loadingRates}
            onMarkPaid={isMember ? handleMarkPaid : undefined}
            avatarUrlByName={avatarByName}
          />
        </div>

        {/* 已結清紀錄 */}
        <div className="mt-6">
          <PaymentHistory
            payments={payments}
            canManage={isMember}
            onRecord={openBlankRecord}
            onDelete={handleDeletePayment}
          />
        </div>
      </div>

      <RecordPaymentDialog
        open={recordDialog.open}
        onClose={recordDialog.closeDialog}
        members={memberOptions}
        initial={recordDialog.data}
        onSubmit={handleRecordSubmit}
      />

      <ConfirmDialog
        open={deletePaymentDialog.open}
        title={tSettlement('deletePayment')}
        message={tSettlement('deletePaymentConfirm')}
        severity="error"
        confirmText={tCommon('delete')}
        cancelText={tCommon('cancel')}
        loading={paymentMutations.remove.isPending}
        onConfirm={confirmDeletePayment}
        onCancel={deletePaymentDialog.closeDialog}
      />
    </div>
  );
}
