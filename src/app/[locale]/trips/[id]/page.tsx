'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Settings, Map, Calculator, BarChart3, ListChecks } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { TripHeader, TripExpenses, TripBudget } from '@/components/trips/detail';

// Dialogs
import { ExpenseFormDialog, EditTripDialog, BudgetDialog } from '@/components/trips/detail/dialogs';

import { useTripDetailPage } from '@/hooks/useTripDetailPage';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TripDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');

  const {
    trip,
    expenses,
    members,
    itineraryDays,
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
    filterMemberId,
    setFilterMemberId,
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push('/trips')} size="lg">
            {tTrips('detail.backToTrips')}
          </Button>
        </div>
      </div>
    );
  }

  if (!trip) return null;

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
                display_name: currentUser.display_name,
              }
            : null
        }
        showUserMenu={true}
        title={trip.name}
      />

      <div className="container mx-auto max-w-6xl pt-24 px-4 sm:px-6">
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

            {isMember && (
              <TripBudget
                budget={trip.budget}
                expenses={expenses}
                isCurrentUserAdmin={isAdmin}
                onEdit={() => budgetDialog.openDialog()}
              />
            )}
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
              filterMemberId={filterMemberId}
              onFilterChange={setFilterMemberId}
              onAdd={() => addExpenseDialog.openDialog()}
              onEdit={(expense) => editExpenseDialog.openDialog(expense)}
              onDelete={handleDeleteExpense}
              expanded={expensesExpanded}
              onToggleExpand={toggleExpensesExpanded}
            />
          </div>
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
