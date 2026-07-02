'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Settings,
  Map,
  Calculator,
  BarChart3,
  ListChecks,
  History,
  Wallet,
} from 'lucide-react';
import { TripHeader, TripExpenses } from '@/components/trips/detail';

// Dialogs
import { ExpenseFormDialog, EditTripDialog, BudgetDialog } from '@/components/trips/detail/dialogs';

import { useTripDetailPage } from '@/hooks/useTripDetailPage';

import { ConfirmDialog, ErrorState } from '@/components/common';
import { TripDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');
  const tBudget = useTranslations('budget');

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
    addExpenseDialog,
    editExpenseDialog,
    deleteExpenseDialog,
    editTripDialog,
    budgetDialog,
    isDeletingExpense,
    filters,
    setFilters,
    expensesExpanded,
    toggleExpensesExpanded,
    handleAddExpense,
    handleEditExpense,
    handleDeleteExpense,
    confirmDeleteExpense,
    handleEditTrip,
    handleSetBudget,
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
    <div className="container mx-auto max-w-6xl py-6 px-4 sm:px-6">
      {/* Navigation & Header Actions */}
      <div className="flex justify-between items-center mb-6">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => router.push('/trips')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tTrips('detail.backToTrips')}
        </Button>

        <div className="flex items-center gap-2">
          {isMember && (
            <Button variant="outline" onClick={() => budgetDialog.openDialog()} className="gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">{tBudget('title')}</span>
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => router.push(`/trips/${tripId}/activity`)}
            className="gap-2"
          >
            <History className="h-4 w-4 text-rose-600" />
            <span className="hidden sm:inline">{tTrip('viewActivity')}</span>
          </Button>

          {isMember && (
            <Button
              variant="outline"
              onClick={() => router.push(`/trips/${tripId}/settings`)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{tTrip('settings')}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
        {/* Left Column: Sidebar (Info, Quick Actions) */}
        <div className="space-y-6 flex flex-col h-full">
          <TripHeader
            trip={trip}
            isCurrentUserAdmin={isAdmin}
            onEdit={() => editTripDialog.openDialog()}
          >
            <Button
              onClick={() => router.push(`/trips/${tripId}/itinerary`)}
              className="flex-1 bg-card hover:bg-accent text-card-foreground border shadow-sm h-10"
              variant="outline"
            >
              <Map className="mr-2 h-4 w-4 text-primary" />
              {tTrip('viewItinerary')}
            </Button>
            <Button
              onClick={() => router.push(`/trips/${tripId}/settlement`)}
              className="flex-1 bg-card hover:bg-accent text-card-foreground border shadow-sm h-10"
              variant="outline"
            >
              <Calculator className="mr-2 h-4 w-4 text-green-600" />
              {tTrip('viewSettlement')}
            </Button>
            <Button
              onClick={() => router.push(`/trips/${tripId}/stats`)}
              className="flex-1 bg-card hover:bg-accent text-card-foreground border shadow-sm h-10"
              variant="outline"
            >
              <BarChart3 className="mr-2 h-4 w-4 text-violet-600" />
              {tTrip('viewStats')}
            </Button>
            <Button
              onClick={() => router.push(`/trips/${tripId}/checklists`)}
              className="flex-1 bg-card hover:bg-accent text-card-foreground border shadow-sm h-10"
              variant="outline"
            >
              <ListChecks className="mr-2 h-4 w-4 text-amber-600" />
              {tTrip('viewChecklist')}
            </Button>
          </TripHeader>
        </div>

        {/* Right Column: Expenses (Main Content) */}
        <div className="min-w-0">
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
            onAdd={() => addExpenseDialog.openDialog()}
            onEdit={(expense) => editExpenseDialog.openDialog(expense)}
            onDelete={handleDeleteExpense}
            expanded={expensesExpanded}
            onToggleExpand={toggleExpensesExpanded}
          />
        </div>
      </div>

      {/* Dialogs */}
      <ExpenseFormDialog
        mode="add"
        tripId={tripId}
        open={addExpenseDialog.open}
        onClose={addExpenseDialog.closeDialog}
        onSubmit={handleAddExpense}
        members={members}
        currentUser={currentUser}
        itineraryDays={itineraryDays}
        existingTags={existingTags}
      />

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

      <BudgetDialog
        open={budgetDialog.open}
        onClose={budgetDialog.closeDialog}
        onSubmit={handleSetBudget}
        budget={trip.budget}
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
