'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { TripHeader, TripExpenses } from '@/components/trips/detail';
import { useTripSpaceActions } from '@/components/trips/space/TripSpaceContext';

// Dialogs（新增支出與預算已上移到行程空間殼）
import { ExpenseFormDialog, EditTripDialog } from '@/components/trips/detail/dialogs';

import { useTripDetailPage } from '@/hooks/useTripDetailPage';

import { ConfirmDialog, ErrorState } from '@/components/common';
import { TripDetailSkeleton } from '@/components/skeletons';

/**
 * 行程空間的「支出」分頁（預設落點）。頁首／分頁列／摘要條／FAB 由
 * trips/[id]/layout.tsx 的 TripSpaceShell 提供，這裡只放內容：
 * 行程資訊卡 + 依日期分組的支出列表。
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
    editTripDialog,
    isDeletingExpense,
    filters,
    setFilters,
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
    handleEditTrip,
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
      <TripHeader
        trip={trip}
        isCurrentUserAdmin={isAdmin}
        onEdit={() => editTripDialog.openDialog()}
      />

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
      <ExpenseFormDialog
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
      />

      <EditTripDialog
        open={editTripDialog.open}
        onClose={editTripDialog.closeDialog}
        onSubmit={handleEditTrip}
        trip={trip}
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
