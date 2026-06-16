'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Settings, Map, Calculator, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Trip, Member, Expense } from '@/types';
import type { AuthUserWithCreatedAt } from '@/actions';
import {
  TripHeader,
  TripExpenses,
} from '@/components/trips/detail';

// Dialogs
import {
  ExpenseFormDialog,
  EditTripDialog,
} from '@/components/trips/detail/dialogs';
import type { ExpenseDialogData, EditTripFormData } from '@/components/trips/detail/dialogs';

import {
  getCurrentUser,
  getTrip,
  getMembers,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  updateTrip,
} from '@/actions';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const tExpense = useTranslations('expense');
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tError = useTranslations('error');

  const { toast } = useToast();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog visibility states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editExpenseDialog, setEditExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editTripDialog, setEditTripDialog] = useState(false);

  // Filter & Expand states
  const [filterMemberId, setFilterMemberId] = useState<string | 'all'>('all');
  const [expensesExpanded, setExpensesExpanded] = useState(true);

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  const loadTripData = async () => {
    try {
      // 嘗試檢查認證（不強制要求登入）
      let user = null;
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        user = userResult.data;
        setCurrentUser(user);
      }

      // 如果已登入，使用 Server Actions
      if (user) {
        const [tripResult, membersResult, expensesResult] = await Promise.all([
          getTrip(tripId),
          getMembers(tripId),
          getExpenses(tripId),
        ]);

        if (!tripResult.success) {
          // 如果不是成員，嘗試使用公開 API
          if (tripResult.code === 'FORBIDDEN') {
            await loadPublicTripData();
            return;
          }
          setError(tError('loadTripFailed'));
          return;
        }

        setTrip(tripResult.data);
        setMembers(membersResult.success ? membersResult.data : []);
        setExpenses(expensesResult.success ? expensesResult.data : []);
      } else {
        // 未登入，使用公開 API
        await loadPublicTripData();
      }
    } catch (err) {
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadPublicTripData = async () => {
    const [tripResponse, membersResponse, expensesResponse] = await Promise.all([
      fetch(`/api/public/trips/${tripId}`),
      fetch(`/api/public/trips/${tripId}/members`),
      fetch(`/api/public/trips/${tripId}/expenses`),
    ]);

    if (!tripResponse.ok) {
      setError(tError('loadTripFailed'));
      return;
    }

    const tripData = await tripResponse.json();
    const membersData = await membersResponse.json();
    const expensesData = await expensesResponse.json();

    setTrip(tripData.trip);
    setMembers(membersData.members || []);
    setExpenses(expensesData.expenses || []);
  };

  const handleAddExpense = async (data: ExpenseDialogData) => {
    const result = await createExpense(tripId, {
      payer_id: data.payer_id,
      original_amount: parseFloat(data.original_amount),
      currency: data.currency,
      exchange_rate: parseFloat(data.exchange_rate),
      description: data.description,
      category: data.category,
      date: data.date,
      splits: data.splits,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    setShowAddExpense(false);
    await loadTripData();
    toast({
      title: tExpense('success.added'),
      description: tExpense('success.addedMessage'),
    });
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm(tExpense('confirm.delete'))) return;

    try {
      const result = await deleteExpense(tripId, expenseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      await loadTripData();
      toast({
        title: "Deleted",
        description: tExpense('success.deleted'),
      });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleEditExpense = async (data: ExpenseDialogData) => {
    if (!editingExpense) return;

    const result = await updateExpense(tripId, editingExpense.id, {
      payer_id: data.payer_id,
      original_amount: parseFloat(data.original_amount),
      currency: data.currency,
      exchange_rate: parseFloat(data.exchange_rate),
      description: data.description.trim(),
      category: data.category,
      date: data.date,
      splits: data.splits,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    setEditExpenseDialog(false);
    setEditingExpense(null);
    await loadTripData();
    toast({
      title: tExpense('success.updated'),
    });
  };

  const handleEditTrip = async (data: EditTripFormData) => {
    const result = await updateTrip(tripId, {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      location: data.location || null,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    setEditTripDialog(false);
    await loadTripData();
    toast({
      title: tTrip('editSuccess'),
    });
  };

  const isCurrentUserMember = currentUser && members.some((m) => m.id === currentUser.id);
  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

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

          {isCurrentUserMember && (
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
              isCurrentUserAdmin={!!isCurrentUserAdmin}
              onEdit={() => setEditTripDialog(true)}
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
              isCurrentUserMember={!!isCurrentUserMember}
              filterMemberId={filterMemberId}
              onFilterChange={setFilterMemberId}
              onAdd={() => setShowAddExpense(true)}
              onEdit={(expense) => {
                setEditingExpense(expense);
                setEditExpenseDialog(true);
              }}
              onDelete={handleDeleteExpense}
              expanded={expensesExpanded}
              onToggleExpand={() => setExpensesExpanded(!expensesExpanded)}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ExpenseFormDialog
        mode="add"
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        onSubmit={handleAddExpense}
        members={members}
        currentUser={currentUser}
      />

      <ExpenseFormDialog
        mode="edit"
        open={editExpenseDialog}
        onClose={() => setEditExpenseDialog(false)}
        onSubmit={handleEditExpense}
        expense={editingExpense}
        members={members}
        currentUser={currentUser}
      />

      <EditTripDialog
        open={editTripDialog}
        onClose={() => setEditTripDialog(false)}
        onSubmit={handleEditTrip}
        trip={trip}
      />
    </div>
  );
}
