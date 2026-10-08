'use client';
import { TripLedgerProvider } from '@/components/trips/space/LedgerCurrency';
import { RecordPaymentDialog } from '@/components/trips/DeferredDialogs';
import { QueryStatus } from '@/components/common/QueryStatus';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  SettlementSummary,
  SettlementBalances,
  SettlementPlan,
  PaymentHistory,
  type PaymentMemberOption,
} from '@/components/settlement';
import { ExportMenu } from '@/components/export';
import {
  useCurrentUser,
  useMembers,
  useSettlement,
  useTrip,
  useTripMembership,
  usePaymentMutations,
} from '@/hooks/queries';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/common';
import { useTripSpaceActions } from '@/components/trips/space/TripSpaceContext';
import { exportSettlement, type ExportFormat } from '@/lib/exporters';
import type { Transaction } from '@/types';
import type { RecordPaymentInput } from '@/lib/validation';
import { SettlementSkeleton } from '@/components/skeletons';
import { MONEY_EPSILON } from '@/lib/money';

export default function SettlementPage() {
  const params = useParams();
  const tripId = params.id as string;
  const tSettlement = useTranslations('settlement');
  const tExport = useTranslations('export');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: currentUser } = useCurrentUser();
  const tripQuery = useTrip(tripId);
  const { data: trip } = tripQuery;
  const settlementQuery = useSettlement(tripId);
  const {
    data: settlement = { balances: [], transactions: [], payments: [], totalExpenses: 0 },
    isLoading: loading,
  } = settlementQuery;
  const membership = useTripMembership(tripId);
  const { isMember } = membership;
  const paymentMutations = usePaymentMutations(tripId);
  const { data: members = [] } = useMembers(tripId);
  const { openAddExpense } = useTripSpaceActions();

  const recordDialog = useDialog<{
    fromId?: string;
    toId?: string;
    amount?: number;
    revision: string;
    baseCurrency: string;
  }>();
  const deletePaymentDialog = useDialog<{ id: string; revision: string; baseCurrency: string }>();

  const { balances, transactions, payments, totalExpenses } = settlement;

  // 成員結算保留服務算出的 ID；顯示名稱可以相同，不能拿來反查成員。
  const memberOptions = useMemo<PaymentMemberOption[]>(() => {
    const counts = new Map<string, number>();
    for (const b of balances) counts.set(b.username, (counts.get(b.username) ?? 0) + 1);
    return balances.map((b) => ({
      id: b.userId,
      name: counts.get(b.username)! > 1 ? `${b.username} (${b.userId.slice(-6)})` : b.username,
    }));
  }, [balances]);

  // 以我為中心（5.4）：頁首摘要講「我」的應收應付；與我有關的轉帳排最前。
  const myBalance = useMemo(
    () => (currentUser ? (balances.find((b) => b.userId === currentUser.id) ?? null) : null),
    [balances, currentUser]
  );
  const hasMyPayments =
    currentUser != null &&
    payments.some((p) => p.fromId === currentUser.id || p.toId === currentUser.id);
  const orderedTransactions = useMemo(() => {
    const myId = currentUser?.id;
    if (!myId) return transactions;
    return [...transactions].sort(
      (a, b) =>
        Number(b.fromId === myId || b.toId === myId) - Number(a.fromId === myId || a.toId === myId)
    );
  }, [transactions, currentUser?.id]);
  const avatarById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.avatar_url ?? null])),
    [members]
  );

  const handleMarkPaid = (tx: Transaction) => {
    if (!tx.fromId || !tx.toId) return;
    recordDialog.openDialog({
      fromId: tx.fromId,
      toId: tx.toId,
      amount: tx.amount,
      revision: settlement.settlementRevision!,
      baseCurrency: settlement.ledger!.baseCurrency,
    });
  };

  // 提醒還款：當事人對欠他款的成員寄出提醒 Email。以 `${fromId}__${toId}` 標記寄送中的列。
  const [remindingKey, setRemindingKey] = useState<string | null>(null);
  const handleRemind = async (tx: Transaction) => {
    const debtorId = tx.fromId;
    if (!debtorId) return;
    setRemindingKey(`${tx.fromId}__${tx.toId}`);
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
    recordDialog.openDialog({
      revision: settlement.settlementRevision!,
      baseCurrency: settlement.ledger!.baseCurrency,
    });
  };

  const handleRecordSubmit = async (input: RecordPaymentInput) => {
    await paymentMutations.record.mutateAsync({
      ...input,
      expected_revision: recordDialog.data!.revision,
      base_currency: recordDialog.data!.baseCurrency,
    });
    toast({ title: tSettlement('paymentRecorded') });
  };

  const handleDeletePayment = (id: string) =>
    deletePaymentDialog.openDialog({
      id,
      revision: settlement.paymentRevisions![id],
      baseCurrency: settlement.ledger!.baseCurrency,
    });

  const confirmDeletePayment = async () => {
    const id = deletePaymentDialog.data;
    if (!id) return;
    try {
      await paymentMutations.remove.mutateAsync({
        paymentId: id.id,
        revision: id.revision,
        baseCurrency: id.baseCurrency,
      });
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
    exportSettlement(
      { balances, transactions, totalExpenses, ledger: settlementQuery.data?.ledger },
      format,
      {
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
      }
    );

  if (loading) {
    return <SettlementSkeleton />;
  }

  if (settlementQuery.data === undefined) return <QueryStatus query={settlementQuery} />;

  return (
    <TripLedgerProvider value={settlementQuery.data.ledger?.baseCurrency ?? null}>
      <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
        <QueryStatus query={tripQuery} />
        <QueryStatus query={settlementQuery} />
        <QueryStatus query={membership.query} />
        {/* 頁首由行程空間殼提供，此列只放匯出 */}
        <div className="mb-4 flex items-center justify-end">
          <ExportMenu
            build={buildExport}
            fileBaseName={`${trip?.name ?? 'trip'}-${tExport('settlement.heading')}`}
            disabled={balances.length === 0}
          />
        </div>

        {/* 摘要：先講「我」的應收應付，總支出次之（訪客檢視退回總支出） */}
        <SettlementSummary
          totalExpenses={totalExpenses}
          myBalance={myBalance}
          hasMyPayments={hasMyPayments}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 每人統計（我排最前） */}
          <SettlementBalances
            balances={balances}
            avatarUrlById={avatarById}
            currentUserId={currentUser?.id}
            hasActivity={totalExpenses >= MONEY_EPSILON || payments.length > 0}
          />

          {/* 結算方案（與我有關的轉帳排最前） */}
          <SettlementPlan
            transactions={orderedTransactions}
            onMarkPaid={isMember ? handleMarkPaid : undefined}
            avatarUrlById={avatarById}
            onRemind={isMember ? handleRemind : undefined}
            currentUserId={isMember ? currentUser?.id : undefined}
            remindingKey={remindingKey}
            hasExpenses={totalExpenses >= MONEY_EPSILON}
            hasPayments={payments.length > 0}
            onAddExpense={isMember ? () => openAddExpense() : undefined}
          />
        </div>

        {/* 已結清紀錄 */}
        <div className="mt-6">
          <PaymentHistory
            payments={payments}
            canManage={isMember}
            onRecord={openBlankRecord}
            onDelete={handleDeletePayment}
            hasExpenses={totalExpenses >= MONEY_EPSILON}
          />
        </div>

        <RecordPaymentDialog
          open={recordDialog.open}
          onClose={recordDialog.closeDialog}
          members={memberOptions}
          initial={
            recordDialog.data?.fromId &&
            recordDialog.data?.toId &&
            recordDialog.data?.amount != null
              ? {
                  fromId: recordDialog.data.fromId,
                  toId: recordDialog.data.toId,
                  amount: recordDialog.data.amount,
                }
              : null
          }
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
    </TripLedgerProvider>
  );
}
