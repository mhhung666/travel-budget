'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { TripExpenses } from '@/components/trips/detail';
import { useTripSpaceActions } from '@/components/trips/space/TripSpaceContext';

// Dialogs（新增支出與預算已上移到行程空間殼）
import { ExpenseFormSheet } from '@/components/trips/detail/expense-form';

import { useTripDetailPage } from '@/hooks/useTripDetailPage';

import { ConfirmDialog, ErrorState } from '@/components/common';
import { TripDetailSkeleton } from '@/components/skeletons';

/**
 * 行程空間的「支出」分頁。頁首／分頁列／摘要條／FAB 由 trips/[id]/layout.tsx 的
 * TripSpaceShell 提供，這裡只放內容：依日期分組的支出列表
 * （行程資訊卡在行程分頁，即空間落點 trips/[id]）。
 */
export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tTrips = useTranslations('trips');
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');

  const { openAddExpense } = useTripSpaceActions();

  const {
    trip,
    expenses,
    members,
    itineraryDays,
    existingTags,
    currentUser,
    isMember,
    isAdmin,
    loading,
    error,
    editExpenseDialog,
    deleteExpenseDialog,
    isDeletingExpense,
    filters,
    setFilters,
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
  } = useTripDetailPage(tripId);

  if (loading) {
    return <TripDetailSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onBack={() => router.push('/trips')}
        backText={tTrips('detail.backToTrips')}
      />
    );
  }

  if (!trip) return null;

  return (
    <div className="container mx-auto max-w-3xl py-4 px-4 sm:px-6">
      <TripExpenses
        tripId={tripId}
        expenses={expenses}
        members={members}
        itineraryDays={itineraryDays}
        tripName={trip.name}
        isCurrentUserMember={isMember}
        currentUserId={currentUser?.id}
        isCurrentUserAdmin={isAdmin}
        filters={filters}
        onFiltersChange={setFilters}
        onAdd={openAddExpense}
        onEdit={(expense) => editExpenseDialog.openDialog(expense)}
        onDelete={handleDeleteExpense}
      />

      {/* Dialogs */}
      <ExpenseFormSheet
        mode="edit"
        tripId={tripId}
        open={editExpenseDialog.open}
        onClose={editExpenseDialog.closeDialog}
        onSubmit={handleEditExpense}
        expense={editExpenseDialog.data}
        members={members}
        currentUser={currentUser}
        itineraryDays={itineraryDays}
        existingTags={existingTags}
        currencySettings={trip.currency_settings}
      />

      <ConfirmDialog
        open={deleteExpenseDialog.open}
        title={tExpense('delete')}
        message={`${tExpense('confirm.delete')} ${tExpense('confirm.deleteMessage')}`}
        severity="error"
        confirmText={tCommon('delete')}
        cancelText={tCommon('cancel')}
        loading={isDeletingExpense}
        onConfirm={confirmDeleteExpense}
        onCancel={deleteExpenseDialog.closeDialog}
      />
    </div>
  );
}
