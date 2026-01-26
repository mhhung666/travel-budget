'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Avatar,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  Divider,
  Snackbar,
  Collapse,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  Delete,
  Calculate,
  AttachMoney,
  Person,
  Close,
  ContentCopy,
  AdminPanelSettings,
  PersonRemove,
  PersonAdd,
  Warning,
  Edit,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import Navbar from '@/components/layout/Navbar';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { CATEGORIES, DEFAULT_CATEGORY, getCategoryIcon } from '@/constants/categories';

interface Location {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  country?: string;
  country_code?: string;
}

interface Trip {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: Location | null;
  created_at: string;
  hash_code: string;
}

interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
  role: 'admin' | 'member';
  is_virtual?: boolean;
}

interface Expense {
  id: number;
  amount: number;
  original_amount: number;
  currency: string;
  exchange_rate: number;
  description: string;
  category: string;
  date: string;
  payer_id: number;
  payer_name: string;
  splits: Array<{
    user_id: number;
    username: string;
    display_name: string;
    share_amount: number;
  }>;
}

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
  const tCurrency = useTranslations('currency');
  const tError = useTranslations('error');
  const tAction = useTranslations('action');

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    payer_id: 0,
    original_amount: '', // 改為 original_amount
    currency: 'TWD', // 新增: 幣別
    exchange_rate: '1.0', // 新增: 匯率
    description: '',
    category: DEFAULT_CATEGORY,
    date: new Date().toISOString().split('T')[0],
    split_with: [] as number[],
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean;
    member: Member | null;
  }>({ open: false, member: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // 篩選分帳對象
  const [filterMemberId, setFilterMemberId] = useState<number | 'all'>('all');

  // 支出記錄展開/收合
  const [expensesExpanded, setExpensesExpanded] = useState(true);

  // 成員列表展開/收合
  const [membersExpanded, setMembersExpanded] = useState(true);

  // 編輯支出相關 state
  const [editExpenseDialog, setEditExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    original_amount: '',
    currency: 'TWD',
    exchange_rate: '1.0',
    category: DEFAULT_CATEGORY,
  });

  // 新增虛擬成員相關 state
  const [addVirtualMemberDialog, setAddVirtualMemberDialog] = useState(false);
  const [virtualMemberName, setVirtualMemberName] = useState('');
  const [isAddingVirtualMember, setIsAddingVirtualMember] = useState(false);

  // 編輯旅行相關 state
  const [editTripDialog, setEditTripDialog] = useState(false);
  const [editTripForm, setEditTripForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [editTripLocation, setEditTripLocation] = useState<LocationOption | null>(null);
  const [isSavingTrip, setIsSavingTrip] = useState(false);

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  const loadTripData = async () => {
    try {
      // 檢查認證
      const authResponse = await fetch('/api/auth/me');
      if (!authResponse.ok) {
        router.push('/login');
        return;
      }
      const authData = await authResponse.json();
      setCurrentUser(authData.user);

      // 載入旅行資料
      const [tripResponse, membersResponse, expensesResponse] = await Promise.all([
        fetch(`/api/trips/${tripId}`),
        fetch(`/api/trips/${tripId}/members`),
        fetch(`/api/trips/${tripId}/expenses`),
      ]);

      if (!tripResponse.ok) {
        if (tripResponse.status === 403) {
          setError(tError('notMember'));
        } else {
          setError(tError('loadTripFailed'));
        }
        return;
      }

      const tripData = await tripResponse.json();
      const membersData = await membersResponse.json();
      const expensesData = await expensesResponse.json();

      setTrip(tripData.trip);
      setMembers(membersData.members);
      setExpenses(expensesData.expenses);

      // 設置默認付款人為當前用戶
      if (authData.user && expenseForm.payer_id === 0) {
        setExpenseForm((prev) => ({ ...prev, payer_id: authData.user.id }));
      }
    } catch (err) {
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...expenseForm,
          original_amount: parseFloat(expenseForm.original_amount),
          exchange_rate: parseFloat(expenseForm.exchange_rate),
          category: expenseForm.category,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowAddExpense(false);
      setExpenseForm({
        payer_id: currentUser?.id || 0,
        original_amount: '',
        currency: 'TWD',
        exchange_rate: '1.0',
        description: '',
        category: DEFAULT_CATEGORY,
        date: new Date().toISOString().split('T')[0],
        split_with: [],
      });
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!confirm(tExpense('confirm.delete'))) return;

    try {
      const response = await fetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      await loadTripData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEditExpenseClick = (expense: Expense) => {
    setEditingExpense(expense);
    setEditForm({
      description: expense.description,
      original_amount: expense.original_amount.toString(),
      currency: expense.currency,
      exchange_rate: expense.exchange_rate.toString(),
      category: expense.category || DEFAULT_CATEGORY,
    });
    setEditExpenseDialog(true);
  };

  const handleEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    setError('');

    try {
      const response = await fetch(`/api/trips/${tripId}/expenses/${editingExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editForm.description.trim(),
          original_amount: parseFloat(editForm.original_amount),
          currency: editForm.currency,
          exchange_rate: parseFloat(editForm.exchange_rate),
          category: editForm.category,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: tExpense('success.updated'), severity: 'success' });
      setEditExpenseDialog(false);
      setEditingExpense(null);
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const calculateConvertedAmount = () => {
    const amount = parseFloat(editForm.original_amount) || 0;
    const rate = parseFloat(editForm.exchange_rate) || 1;
    return amount * rate;
  };

  const calculateAddExpenseConvertedAmount = () => {
    const amount = parseFloat(expenseForm.original_amount) || 0;
    const rate = parseFloat(expenseForm.exchange_rate) || 1;
    return amount * rate;
  };

  const toggleSplitMember = (userId: number) => {
    setExpenseForm((prev) => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter((id) => id !== userId)
        : [...prev.split_with, userId],
    }));
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
      const response = await fetch(`/api/trips/${tripId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
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

  const handleRemoveMember = async (userId: number) => {
    try {
      const response = await fetch(`/api/trips/${tripId}/members/${userId}`, { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: tMember('success.removed'), severity: 'success' });
      setRemoveMemberDialog({ open: false, member: null });
      await loadTripData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  // 打開編輯旅行對話框
  const handleEditTripClick = () => {
    if (!trip) return;
    setEditTripForm({
      name: trip.name,
      description: trip.description || '',
      start_date: trip.start_date || '',
      end_date: trip.end_date || '',
    });
    setEditTripLocation(trip.location ? {
      name: trip.location.name,
      display_name: trip.location.display_name,
      lat: trip.location.lat,
      lon: trip.location.lon,
      country: trip.location.country,
      country_code: trip.location.country_code,
    } : null);
    setEditTripDialog(true);
  };

  // 提交編輯旅行
  const handleEditTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    setIsSavingTrip(true);
    setError('');

    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTripForm.name.trim(),
          description: editTripForm.description.trim() || null,
          start_date: editTripForm.start_date || null,
          end_date: editTripForm.end_date || null,
          location: editTripLocation || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: tTrip('editSuccess'), severity: 'success' });
      setEditTripDialog(false);
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setIsSavingTrip(false);
    }
  };

  // 新增虛擬成員
  const handleAddVirtualMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!virtualMemberName.trim()) return;

    setIsAddingVirtualMember(true);
    setError('');

    try {
      const response = await fetch(`/api/trips/${tripId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: virtualMemberName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: tMember('virtualMemberAdded'), severity: 'success' });
      setAddVirtualMemberDialog(false);
      setVirtualMemberName('');
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setIsAddingVirtualMember(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          startIcon={<ArrowBack />}
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
          {/* 旅行資訊 */}
          <Box>
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>
                    {tTrip('info')}
                  </Typography>
                  {isCurrentUserAdmin && (
                    <Button
                      size="small"
                      startIcon={<Edit />}
                      onClick={handleEditTripClick}
                    >
                      {tCommon('edit')}
                    </Button>
                  )}
                </Box>
                {trip.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {trip.description}
                  </Typography>
                )}

                {/* 地點顯示 */}
                {trip.location && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      📍 {trip.location.name}{trip.location.country && `, ${trip.location.country}`}
                    </Typography>
                  </Box>
                )}

                {/* 日期顯示 */}
                {(trip.start_date || trip.end_date) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      📅 {trip.start_date ? new Date(trip.start_date).toLocaleDateString() : ''}
                      {trip.start_date && trip.end_date && ' ~ '}
                      {trip.end_date ? new Date(trip.end_date).toLocaleDateString() : ''}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${tTrip('createdAt')} ${new Date(trip.created_at).toLocaleDateString()}`}
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>

            {/* 支出列表 */}
            <Card elevation={2}>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    mb: expensesExpanded ? 2 : 0,
                  }}
                  onClick={() => setExpensesExpanded(!expensesExpanded)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" fontWeight={600}>
                      {tExpense('title')}
                    </Typography>
                    <Chip label={expenses.length} size="small" color="primary" />
                  </Box>
                  <IconButton size="small">
                    {expensesExpanded ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </Box>

                <Collapse in={expensesExpanded}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 2,
                      flexWrap: 'wrap',
                      gap: 2,
                    }}
                  >
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>{tExpense('filter')}</InputLabel>
                      <Select
                        value={filterMemberId}
                        onChange={(e) => setFilterMemberId(e.target.value as number | 'all')}
                        label={tExpense('filter')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MenuItem value="all">{tExpense('filterAll')}</MenuItem>
                        {members.map((member) => (
                          <MenuItem key={member.id} value={member.id}>
                            {member.display_name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAddExpense(true);
                      }}
                      variant="contained"
                      startIcon={<Add />}
                    >
                      {tExpense('add')}
                    </Button>
                  </Box>

                  {(() => {
                    const filteredExpenses =
                      filterMemberId === 'all'
                        ? expenses
                        : expenses.filter((expense) =>
                            expense.splits.some((split) => split.user_id === filterMemberId)
                          );

                    if (expenses.length === 0) {
                      return (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                          <Typography variant="body1" color="text.secondary" gutterBottom>
                            {tExpense('noExpenses')}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {tExpense('clickToAdd')}
                          </Typography>
                        </Box>
                      );
                    }

                    if (filteredExpenses.length === 0) {
                      return (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                          <Typography variant="body1" color="text.secondary" gutterBottom>
                            {tExpense('noFilterResults')}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {tExpense('noFilterResultsHint')}
                          </Typography>
                        </Box>
                      );
                    }

                    return (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredExpenses.map((expense) => (
                          <Card
                            key={expense.id}
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              transition: 'all 0.3s',
                              '&:hover': { boxShadow: 2 },
                            }}
                          >
                            <CardContent>
                              <Box
                                sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  mb: 1,
                                }}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                      {getCategoryIcon(expense.category)} {expense.description}
                                    </Typography>
                                  </Box>
                                  <Typography variant="body2" color="text.secondary">
                                    {expense.payer_name} {tExpense('paidBy')} •{' '}
                                    {new Date(expense.date).toLocaleDateString()}
                                  </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                  {expense.currency !== 'TWD' ? (
                                    <>
                                      <Typography variant="body2" color="text.secondary">
                                        {expense.original_amount.toLocaleString()}{' '}
                                        {expense.currency} ({tExpense('rate')} {expense.exchange_rate})
                                      </Typography>
                                      <Typography variant="h6" color="primary" fontWeight={700}>
                                        = NT${expense.amount.toLocaleString()}
                                      </Typography>
                                    </>
                                  ) : (
                                    <Typography variant="h6" color="primary" fontWeight={700}>
                                      NT${expense.amount.toLocaleString()}
                                    </Typography>
                                  )}
                                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                    <Button
                                      onClick={() => handleEditExpenseClick(expense)}
                                      size="small"
                                      startIcon={<Edit />}
                                    >
                                      {tCommon('edit')}
                                    </Button>
                                    <Button
                                      onClick={() => handleDeleteExpense(expense.id)}
                                      size="small"
                                      color="error"
                                      startIcon={<Delete />}
                                    >
                                      {tCommon('delete')}
                                    </Button>
                                  </Box>
                                </Box>
                              </Box>
                              <Divider sx={{ my: 1.5 }} />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                                sx={{ mb: 1 }}
                              >
                                {tExpense('splitMembers')}
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {expense.splits.map((split) => (
                                  <Chip
                                    key={split.user_id}
                                    label={`${split.display_name}: $${split.share_amount.toFixed(0)}`}
                                    size="small"
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                            </CardContent>
                          </Card>
                        ))}
                      </Box>
                    );
                  })()}
                </Collapse>
              </CardContent>
            </Card>
          </Box>

          {/* 成員列表 */}
          <Box>
            <Card elevation={2}>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    mb: membersExpanded ? 2 : 0,
                  }}
                  onClick={() => setMembersExpanded(!membersExpanded)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" fontWeight={600}>
                      {tMember('title')}
                    </Typography>
                    <Chip label={members.length} size="small" color="primary" />
                  </Box>
                  <IconButton size="small">
                    {membersExpanded ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </Box>
                <Collapse in={membersExpanded}>
                  {/* 新增虛擬成員按鈕 */}
                  {isCurrentUserAdmin && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<PersonAdd />}
                      onClick={() => setAddVirtualMemberDialog(true)}
                      sx={{ mb: 2 }}
                      fullWidth
                    >
                      {tMember('addVirtualMember')}
                    </Button>
                  )}

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {members.map((member) => (
                      <Box
                        key={member.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          p: 1.5,
                          bgcolor: member.is_virtual ? 'action.hover' : 'background.default',
                          borderRadius: 1,
                          border: member.is_virtual ? '1px dashed' : 'none',
                          borderColor: 'divider',
                        }}
                      >
                        <Avatar sx={{ bgcolor: member.is_virtual ? 'grey.400' : 'primary.main' }}>
                          {member.display_name.charAt(0)}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body1" fontWeight={500}>
                              {member.display_name}
                            </Typography>
                            {member.role === 'admin' && (
                              <Chip
                                label={tMember('role.admin')}
                                size="small"
                                color="primary"
                                icon={<AdminPanelSettings />}
                              />
                            )}
                            {member.is_virtual && (
                              <Chip
                                label={tMember('role.virtual')}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                          {!member.is_virtual && (
                            <Typography variant="body2" color="text.secondary">
                              @{member.username}
                            </Typography>
                          )}
                        </Box>
                        {/* 移除按鈕 - 僅管理員且不是自己 */}
                        {isCurrentUserAdmin && member.id !== currentUser?.id && (
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemoveMemberDialog({ open: true, member });
                            }}
                          >
                            <PersonRemove />
                          </IconButton>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </CardContent>
            </Card>

            {/* 分享功能 */}
            <Card elevation={2} sx={{ mt: 3, bgcolor: 'primary.50' }}>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                  {tTrip('share')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    value={trip.hash_code}
                    size="small"
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ flex: 1, bgcolor: 'background.paper' }}
                  />
                  <Button variant="outlined" startIcon={<ContentCopy />} onClick={copyHashCode}>
                    {tCommon('copy')}
                  </Button>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: 'block' }}
                >
                  {tTrip('shareHint')}
                </Typography>
              </CardContent>
            </Card>

            {/* 結算按鈕 */}
            <Card elevation={2} sx={{ mt: 3 }}>
              <CardContent>
                <Button
                  onClick={() => router.push(`/trips/${tripId}/settlement`)}
                  variant="contained"
                  color="success"
                  fullWidth
                  size="large"
                  startIcon={<Calculate />}
                  sx={{ py: 1.5, fontWeight: 600 }}
                >
                  {tTrip('viewSettlement')}
                </Button>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textAlign="center"
                  display="block"
                  sx={{ mt: 1 }}
                >
                  {tTrip('viewSettlementHint')}
                </Typography>
              </CardContent>
            </Card>

            {/* 危險操作區 - 僅管理員可見 */}
            {isCurrentUserAdmin && (
              <Card
                elevation={2}
                sx={{ mt: 3, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}
              >
                <CardContent>
                  <Typography variant="subtitle2" color="error" gutterBottom fontWeight={600}>
                    {tTrip('dangerZone')}
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Delete />}
                    fullWidth
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    {tTrip('deleteTrip')}
                  </Button>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 1 }}
                  >
                    {tTrip('deleteWarning')}
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Box>
        </Box>
      </Container>

      {/* 新增支出 Dialog */}
      <Dialog
        open={showAddExpense}
        onClose={() => {
          setShowAddExpense(false);
          setError('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {tExpense('add')}
            <IconButton
              onClick={() => {
                setShowAddExpense(false);
                setError('');
              }}
              size="small"
            >
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <form onSubmit={handleAddExpense}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>{tExpense('form.payer')} *</InputLabel>
              <Select
                value={expenseForm.payer_id}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    payer_id:
                      typeof e.target.value === 'string'
                        ? parseInt(e.target.value)
                        : e.target.value,
                  })
                }
                label={`${tExpense('form.payer')} *`}
                required
              >
                <MenuItem value={0}>--</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.id} value={member.id}>
                    {member.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>{tExpense('form.currency')} *</InputLabel>
              <Select
                value={expenseForm.currency}
                onChange={(e) => {
                  const currency = e.target.value;
                  setExpenseForm({
                    ...expenseForm,
                    currency,
                    exchange_rate: currency === 'TWD' ? '1.0' : expenseForm.exchange_rate,
                  });
                }}
                label={`${tExpense('form.currency')} *`}
                required
              >
                <MenuItem value="TWD">{tCurrency('TWD_full')}</MenuItem>
                <MenuItem value="JPY">{tCurrency('JPY_full')}</MenuItem>
                <MenuItem value="USD">{tCurrency('USD_full')}</MenuItem>
                <MenuItem value="EUR">{tCurrency('EUR_full')}</MenuItem>
                <MenuItem value="HKD">{tCurrency('HKD_full')}</MenuItem>
              </Select>
            </FormControl>

            <Box
              sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}
            >
              <TextField
                fullWidth
                type="number"
                label={`${tExpense('form.amount')} *`}
                value={expenseForm.original_amount}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, original_amount: e.target.value })
                }
                required
                inputProps={{ step: '0.01', min: '0.01' }}
                placeholder="0.00"
              />

              {expenseForm.currency !== 'TWD' && (
                <TextField
                  fullWidth
                  type="number"
                  label={`${tExpense('form.exchangeRate')} *`}
                  value={expenseForm.exchange_rate}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, exchange_rate: e.target.value })
                  }
                  required
                  inputProps={{ step: '0.000001', min: '0' }}
                  placeholder="0.22"
                />
              )}
            </Box>

            {expenseForm.currency !== 'TWD' && (
              <Alert severity="info" icon={<AttachMoney />} sx={{ mb: 2 }}>
                {tExpense('form.convertedAmount')}: <strong>NT${calculateAddExpenseConvertedAmount().toLocaleString()}</strong>
              </Alert>
            )}

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>{tExpense('form.category')} *</InputLabel>
              <Select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                label={`${tExpense('form.category')} *`}
                required
              >
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat.code} value={cat.code}>
                    {cat.icon} {t(cat.nameKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label={`${tExpense('form.description')} *`}
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              required
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              type="date"
              label={`${tExpense('form.date')} *`}
              value={expenseForm.date}
              onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              required
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {tExpense('form.splitWith')} *
                {expenseForm.split_with.length > 0 && (
                  <Typography component="span" color="primary" sx={{ ml: 1 }}>
                    ({tExpense('selected')} {expenseForm.split_with.length})
                  </Typography>
                )}
              </Typography>
              <Box
                sx={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                  bgcolor: 'background.default',
                }}
              >
                {members.map((member) => (
                  <FormControlLabel
                    key={member.id}
                    control={
                      <Checkbox
                        checked={expenseForm.split_with.includes(member.id)}
                        onChange={() => toggleSplitMember(member.id)}
                      />
                    }
                    label={member.display_name}
                    sx={{
                      width: '100%',
                      m: 0,
                      p: 1,
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  />
                ))}
              </Box>
              {expenseForm.split_with.length > 0 &&
                expenseForm.original_amount &&
                parseFloat(expenseForm.original_amount) > 0 && (
                  <Alert severity="info" icon={<AttachMoney />} sx={{ mt: 1 }}>
                    {tExpense('perPerson')}{' '}
                    <strong>
                      NT$
                      {(
                        calculateAddExpenseConvertedAmount() / expenseForm.split_with.length
                      ).toFixed(2)}
                    </strong>
                  </Alert>
                )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setShowAddExpense(false);
                setError('');
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={expenseForm.split_with.length === 0}
            >
              {tExpense('add')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 確認刪除旅行對話框 */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{tTrip('deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />}>
            {tTrip('deleteConfirmWarning')}
          </Alert>
          <Typography>{tTrip('deleteConfirmMessage', { name: trip?.name })}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tTrip('deleteConfirmDetails')}
          </Typography>
          <Box component="ul" sx={{ pl: 2, mt: 1 }}>
            <Typography component="li" variant="body2">
              {tTrip('deleteItem1')}
            </Typography>
            <Typography component="li" variant="body2">
              {tTrip('deleteItem2')}
            </Typography>
            <Typography component="li" variant="body2">
              {tTrip('deleteItem3')}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>{tCommon('cancel')}</Button>
          <Button
            onClick={handleDeleteTrip}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {isDeleting ? tTrip('deleting') : tTrip('confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 確認移除成員對話框 */}
      <Dialog
        open={removeMemberDialog.open}
        onClose={() => setRemoveMemberDialog({ open: false, member: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{tTrip('removeMember')}</DialogTitle>
        <DialogContent>
          <Typography>{tTrip('removeMemberConfirm', { name: removeMemberDialog.member?.display_name ?? '' })}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tTrip('removeMemberNote')}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveMemberDialog({ open: false, member: null })}>{tCommon('cancel')}</Button>
          <Button
            onClick={() => handleRemoveMember(removeMemberDialog.member!.id)}
            color="error"
            variant="contained"
          >
            {tMember('remove')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編輯支出對話框 */}
      <Dialog
        open={editExpenseDialog}
        onClose={() => setEditExpenseDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleEditExpense}>
          <DialogTitle>{tExpense('edit')}</DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label={tExpense('form.description')}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              margin="normal"
              required
            />

            <FormControl fullWidth margin="normal" required>
              <InputLabel>{tExpense('form.category')}</InputLabel>
              <Select
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                label={tExpense('form.category')}
              >
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat.code} value={cat.code}>
                    {cat.icon} {t(cat.nameKey)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth margin="normal" required>
              <InputLabel>{tExpense('form.currency')}</InputLabel>
              <Select
                value={editForm.currency}
                onChange={(e) => {
                  const currency = e.target.value;
                  setEditForm({
                    ...editForm,
                    currency,
                    exchange_rate: currency === 'TWD' ? '1.0' : editForm.exchange_rate,
                  });
                }}
                label={tExpense('form.currency')}
              >
                <MenuItem value="TWD">{tCurrency('TWD_full')}</MenuItem>
                <MenuItem value="JPY">{tCurrency('JPY_full')}</MenuItem>
                <MenuItem value="USD">{tCurrency('USD_full')}</MenuItem>
                <MenuItem value="EUR">{tCurrency('EUR_full')}</MenuItem>
                <MenuItem value="HKD">{tCurrency('HKD_full')}</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
              <TextField
                fullWidth
                label={tExpense('form.amount')}
                type="number"
                value={editForm.original_amount}
                onChange={(e) => setEditForm({ ...editForm, original_amount: e.target.value })}
                margin="normal"
                required
                inputProps={{ min: 0, step: '0.01' }}
              />

              {editForm.currency !== 'TWD' && (
                <TextField
                  fullWidth
                  label={tExpense('form.exchangeRate')}
                  type="number"
                  value={editForm.exchange_rate}
                  onChange={(e) => setEditForm({ ...editForm, exchange_rate: e.target.value })}
                  margin="normal"
                  required
                  inputProps={{ min: 0, step: '0.000001' }}
                />
              )}
            </Box>

            {editForm.currency !== 'TWD' && (
              <Alert severity="info" sx={{ mt: 2 }}>
                {tExpense('form.convertedAmount')}: {calculateConvertedAmount().toLocaleString()} TWD
              </Alert>
            )}

            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {tTrip('notEditable')}
              </Typography>
              <Typography variant="body2">{tExpense('form.payer')}: {editingExpense?.payer_name}</Typography>
              <Typography variant="body2">
                {tExpense('form.date')}:{' '}
                {editingExpense ? new Date(editingExpense.date).toLocaleDateString() : ''}
              </Typography>
              <Typography variant="body2">
                {tExpense('form.splitWith')}: {editingExpense?.splits.map((s) => s.display_name).join(', ')}
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditExpenseDialog(false)}>{tCommon('cancel')}</Button>
            <Button type="submit" variant="contained">
              {tTrip('saveEdit')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 編輯旅行對話框 */}
      <Dialog
        open={editTripDialog}
        onClose={() => setEditTripDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleEditTrip}>
          <DialogTitle>{tTrip('editTrip')}</DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label={tTrips('create.name')}
              value={editTripForm.name}
              onChange={(e) => setEditTripForm({ ...editTripForm, name: e.target.value })}
              required
              sx={{ mt: 1, mb: 2 }}
            />

            <TextField
              fullWidth
              label={tTrips('create.description')}
              value={editTripForm.description}
              onChange={(e) => setEditTripForm({ ...editTripForm, description: e.target.value })}
              multiline
              rows={3}
              sx={{ mb: 2 }}
            />

            {/* 旅遊地點 */}
            <LocationAutocomplete
              value={editTripLocation}
              onChange={setEditTripLocation}
              label={tTrips('create.location')}
              placeholder={tTrips('create.locationPlaceholder')}
              helperText={tTrips('create.locationHelp')}
            />

            {/* 旅遊時間區間 */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <TextField
                fullWidth
                label={tTrips('create.startDate')}
                type="date"
                value={editTripForm.start_date}
                onChange={(e) => setEditTripForm({ ...editTripForm, start_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
              <TextField
                fullWidth
                label={tTrips('create.endDate')}
                type="date"
                value={editTripForm.end_date}
                onChange={(e) => setEditTripForm({ ...editTripForm, end_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: editTripForm.start_date || undefined },
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditTripDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSavingTrip || !editTripForm.name.trim()}
              startIcon={isSavingTrip ? <CircularProgress size={16} /> : null}
            >
              {tTrip('saveEdit')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 新增虛擬成員對話框 */}
      <Dialog
        open={addVirtualMemberDialog}
        onClose={() => setAddVirtualMemberDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleAddVirtualMember}>
          <DialogTitle>{tMember('addVirtualMember')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {tMember('addVirtualMemberHint')}
            </Typography>
            <TextField
              fullWidth
              label={tMember('virtualMemberName')}
              value={virtualMemberName}
              onChange={(e) => setVirtualMemberName(e.target.value)}
              required
              autoFocus
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setAddVirtualMemberDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isAddingVirtualMember || !virtualMemberName.trim()}
              startIcon={isAddingVirtualMember ? <CircularProgress size={16} /> : null}
            >
              {tCommon('add')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar 通知 */}
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
