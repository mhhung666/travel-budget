'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Trip, Member, Expense } from '@/types';
import {
  TripHeader,
  TripExpenses,
  TripMembers,
  TripShare,
  TripSettlement,
  TripDangerZone,
  AddExpenseDialog,
  EditExpenseDialog,
  EditTripDialog,
  AddVirtualMemberDialog,
  DeleteTripDialog,
  RemoveMemberDialog,
} from '@/components/trips';
import {
  getCurrentUser,
  getTrip,
  getMembers,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  updateTrip,
  deleteTrip,
  addVirtualMember,
  removeMember,
} from '@/actions';

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const tExpense = useTranslations('expense');
  const tMember = useTranslations('member');
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tError = useTranslations('error');
  const tAction = useTranslations('action');

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog visibility states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editExpenseDialog, setEditExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editTripDialog, setEditTripDialog] = useState(false);
  const [addVirtualMemberDialog, setAddVirtualMemberDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean;
    member: Member | null;
  }>({ open: false, member: null });

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  const [isDeleting, setIsDeleting] = useState(false);

  // Filter & Expand states
  const [filterMemberId, setFilterMemberId] = useState<number | 'all'>('all');
  const [expensesExpanded, setExpensesExpanded] = useState(true);
  const [membersExpanded, setMembersExpanded] = useState(true);

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

  const handleAddExpense = async (data: any) => {
    try {
      const result = await createExpense(tripId, {
        payer_id: data.payer_id,
        original_amount: parseFloat(data.original_amount),
        currency: data.currency,
        exchange_rate: parseFloat(data.exchange_rate),
        description: data.description,
        category: data.category,
        date: data.date,
        split_with: data.split_with,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setShowAddExpense(false);
      await loadTripData();
    } catch (err: any) {
      throw err; // Let dialog handle error display
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!confirm(tExpense('confirm.delete'))) return;

    try {
      const result = await deleteExpense(tripId, expenseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      await loadTripData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEditExpense = async (data: any) => {
    if (!editingExpense) return;

    try {
      const result = await updateExpense(tripId, editingExpense.id, {
        description: data.description.trim(),
        original_amount: parseFloat(data.original_amount),
        currency: data.currency,
        exchange_rate: parseFloat(data.exchange_rate),
        category: data.category,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tExpense('success.updated'), severity: 'success' });
      setEditExpenseDialog(false);
      setEditingExpense(null);
      await loadTripData();
    } catch (err: any) {
      throw err;
    }
  };

  const copyHashCode = async () => {
    try {
      await navigator.clipboard.writeText(trip?.hash_code || '');
      setSnackbar({ open: true, message: tAction('copySuccess'), severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: tAction('copyFailed'), severity: 'error' });
    }
  };

  const handleDeleteTrip = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTrip(tripId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tTrip('deleted'), severity: 'success' });
      setTimeout(() => router.push('/trips'), 1000);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberDialog.member) return;
    try {
      const result = await removeMember(tripId, removeMemberDialog.member.id);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tMember('success.removed'), severity: 'success' });
      setRemoveMemberDialog({ open: false, member: null });
      await loadTripData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleEditTrip = async (data: any) => {
    try {
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

      setSnackbar({ open: true, message: tTrip('editSuccess'), severity: 'success' });
      setEditTripDialog(false);
      await loadTripData();
    } catch (err: any) {
      throw err;
    }
  };

  const handleAddVirtualMember = async (name: string) => {
    try {
      const result = await addVirtualMember(tripId, {
        display_name: name.trim(),
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tMember('virtualMemberAdded'), severity: 'success' });
      setAddVirtualMemberDialog(false);
      await loadTripData();
    } catch (err: any) {
      throw err;
    }
  };

  const isCurrentUserMember = currentUser && members.some((m) => m.id === currentUser.id);
  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
          <Button onClick={() => router.push('/trips')} variant="contained" size="large">
            {tTrips('detail.backToTrips')}
          </Button>
        </Box>
      </Box>
    );
  }

  if (!trip) return null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
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
        title={trip.name}
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        {/* 返回按鈕 */}
        <Button
          startIcon={<ArrowLeft />}
          onClick={() => router.push('/trips')}
          sx={{
            mb: 3,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
            },
          }}
        >
          {tTrips('detail.backToTrips')}
        </Button>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
          {/* 旅行資訊卡片 */}
          <Box>
            <TripHeader
              trip={trip}
              isCurrentUserAdmin={!!isCurrentUserAdmin}
              onEdit={() => setEditTripDialog(true)}
            />

            {/* 支出列表 */}
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
          </Box>

          {/* 側邊欄 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 成員列表 */}
            <TripMembers
              members={members}
              currentUser={currentUser}
              isCurrentUserAdmin={!!isCurrentUserAdmin}
              onAddVirtualMember={() => setAddVirtualMemberDialog(true)}
              onRemoveMember={(member) => setRemoveMemberDialog({ open: true, member })}
              expanded={membersExpanded}
              onToggleExpand={() => setMembersExpanded(!membersExpanded)}
            />

            {/* 分享功能 */}
            <TripShare
              tripHashCode={trip.hash_code}
              onCopy={copyHashCode}
            />

            {/* 結算按鈕 */}
            <TripSettlement tripId={tripId} />

            {/* 危險操作區 */}
            {isCurrentUserAdmin && (
              <TripDangerZone onDelete={() => setDeleteDialogOpen(true)} />
            )}
          </Box>
        </Box>
      </Container>

      {/* Dialogs */}
      <AddExpenseDialog
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        onSubmit={handleAddExpense}
        members={members}
        currentUser={currentUser}
      />

      <EditExpenseDialog
        open={editExpenseDialog}
        onClose={() => setEditExpenseDialog(false)}
        onSubmit={handleEditExpense}
        expense={editingExpense}
      />

      <EditTripDialog
        open={editTripDialog}
        onClose={() => setEditTripDialog(false)}
        onSubmit={handleEditTrip}
        trip={trip}
      />

      <AddVirtualMemberDialog
        open={addVirtualMemberDialog}
        onClose={() => setAddVirtualMemberDialog(false)}
        onSubmit={handleAddVirtualMember}
      />

      <DeleteTripDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteTrip}
        tripName={trip.name}
        isDeleting={isDeleting}
      />

      <RemoveMemberDialog
        open={removeMemberDialog.open}
        onClose={() => setRemoveMemberDialog({ open: false, member: null })}
        onConfirm={handleRemoveMember}
        member={removeMemberDialog.member}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
