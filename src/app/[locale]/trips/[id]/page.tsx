'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Settings, Map, Calculator, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import {
  TripHeader,
  TripExpenses,
} from '@/components/trips/detail';

// Dialogs
import {
  ExpenseFormDialog,
  EditTripDialog,
} from '@/components/trips/detail/dialogs';

import { useTripDetailPage } from '@/hooks/useTripDetailPage';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
    currentUser,
    isMember,
    isAdmin,
    loading,
    error,
    addExpenseDialog,
    editExpenseDialog,
    deleteExpenseDialog,
    editTripDialog,
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
  } = useTripDetailPage(tripId);

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
            </TripHeader>
          </div>

          {/* Right Column: Expenses (Main Content) */}
          <div className="min-w-0">
            <TripExpenses
              expenses={expenses}
              members={members}
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
        open={addExpenseDialog.open}
        onClose={addExpenseDialog.closeDialog}
        onSubmit={handleAddExpense}
        members={members}
        currentUser={currentUser}
      />

      <ExpenseFormDialog
        mode="edit"
        open={editExpenseDialog.open}
        onClose={editExpenseDialog.closeDialog}
        onSubmit={handleEditExpense}
        expense={editExpenseDialog.data}
        members={members}
        currentUser={currentUser}
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
