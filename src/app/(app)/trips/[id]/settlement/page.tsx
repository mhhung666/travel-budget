'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
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
import { ConfirmDialog, ErrorState } from '@/components/common';
import { exportSettlement, type ExportFormat } from '@/lib/exporters';
import { resolveTripRates, getTripCurrencyOptions } from '@/lib/tripCurrency';
import type { Transaction } from '@/types';
import type { RecordPaymentInput } from '@/lib/validation';
import { SettlementSkeleton } from '@/components/skeletons';

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

  // 顯示換算：旅程自訂匯率優先於即時匯率；幣別選項常用排前（見 lib/tripCurrency）
  const displayRates = useMemo(
    () => resolveTripRates(trip?.currency_settings, exchangeRates),
    [trip?.currency_settings, exchangeRates]
  );
  const currencyOptions = useMemo(
    () => getTripCurrencyOptions(trip?.currency_settings),
    [trip?.currency_settings]
  );

  // 建議轉帳只帶名字（calculateSettlement 不回 id）；用餘額表把名字對回 id 以預填登記表單。
  const memberOptions = useMemo<PaymentMemberOption[]>(
    () => balances.map((b) => ({ id: b.userId, name: b.username })),
    [balances]
  );

  // 以我為中心（5.4）：頁首摘要講「我」的應收應付；與我有關的轉帳排最前。
  const myBalance = useMemo(
    () => (currentUser ? (balances.find((b) => b.userId === currentUser.id) ?? null) : null),
    [balances, currentUser]
  );
  const orderedTransactions = useMemo(() => {
    const myName = currentUser?.display_name;
    if (!myName) return transactions;
    return [...transactions].sort(
      (a, b) =>
        Number(b.from === myName || b.to === myName) - Number(a.from === myName || a.to === myName)
    );
  }, [transactions, currentUser?.display_name]);
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

  // 提醒還款：當事人對欠他款的成員寄出提醒 Email。以 `${from}__${to}` 標記寄送中的列。
  const [remindingKey, setRemindingKey] = useState<string | null>(null);
  const handleRemind = async (tx: Transaction) => {
    const debtorId = nameToId.get(tx.from);
    if (!debtorId) return;
    setRemindingKey(`${tx.from}__${tx.to}`);
    try {
      await paymentMutations.remind.mutateAsync(debtorId);
      toast({ title: tSettlement('reminderSent') });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      const known = ['remindFailedNoEmail', 'remindFailedNotOwed', 'remindFailed'];
      toast({
        variant: 'destructive',
        title: tCommon('errorTitle'),
        description: tSettlement(known.includes(code) ? code : 'remindFailed'),
      });
    } finally {
      setRemindingKey(null);
    }
  };

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
      <ErrorState
        message={error}
        onBack={() => router.push(`/trips/${tripId}`)}
        backText={tSettlement('backToTrip')}
      />
    );
  }

  return (
    <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
      {/* 頁首由行程空間殼提供，此列只放匯出 */}
      <div className="mb-4 flex items-center justify-end">
        <ExportMenu
          build={buildExport}
          fileBaseName={`${trip?.name ?? 'trip'}-${tExport('settlement.heading')}`}
          disabled={balances.length === 0}
        />
      </div>

      {/* 摘要：先講「我」的應收應付，總支出次之（訪客檢視退回總支出） */}
      <SettlementSummary totalExpenses={totalExpenses} myBalance={myBalance} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 每人統計（我排最前） */}
        <SettlementBalances
          balances={balances}
          avatarUrlById={avatarById}
          currentUserId={currentUser?.id}
        />

        {/* 結算方案（與我有關的轉帳排最前） */}
        <SettlementPlan
          transactions={orderedTransactions}
          exchangeRates={displayRates}
          loadingRates={loadingRates}
          currencyOptions={currencyOptions}
          onMarkPaid={isMember ? handleMarkPaid : undefined}
          avatarUrlByName={avatarByName}
          onRemind={isMember ? handleRemind : undefined}
          currentUserName={currentUser?.display_name}
          remindingKey={remindingKey}
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
