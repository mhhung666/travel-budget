'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
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
  Warning,
  Edit,
} from '@mui/icons-material';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  hash_code: string;
}

interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
  role: 'admin' | 'member';
}

interface Expense {
  id: number;
  amount: number;
  original_amount: number;
  currency: string;
  exchange_rate: number;
  description: string;
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

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    payer_id: 0,
    original_amount: '',  // 改為 original_amount
    currency: 'TWD',      // 新增: 幣別
    exchange_rate: '1.0', // 新增: 匯率
    description: '',
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

  // 編輯支出相關 state
  const [editExpenseDialog, setEditExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    original_amount: '',
    currency: 'TWD',
    exchange_rate: '1.0',
  });

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
          setError('您不是此旅行的成員');
        } else {
          setError('無法載入旅行資料');
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
        setExpenseForm(prev => ({ ...prev, payer_id: authData.user.id }));
      }
    } catch (err) {
      setError('載入失敗');
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
        date: new Date().toISOString().split('T')[0],
        split_with: [],
      });
      await loadTripData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!confirm('確定要刪除這筆支出嗎?')) return;

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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: '支出已更新', severity: 'success' });
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
    setExpenseForm(prev => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter(id => id !== userId)
        : [...prev.split_with, userId],
    }));
  };

  const copyHashCode = async () => {
    try {
      await navigator.clipboard.writeText(trip?.hash_code || '');
      setSnackbar({ open: true, message: 'ID 已複製!', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: '複製失敗，請手動複製', severity: 'error' });
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

      setSnackbar({ open: true, message: '旅行已刪除', severity: 'success' });
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
      const response = await fetch(
        `/api/trips/${tripId}/members/${userId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      setSnackbar({ open: true, message: '成員已移除', severity: 'success' });
      setRemoveMemberDialog({ open: false, member: null });
      await loadTripData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const isCurrentUserAdmin = members.find(
    m => m.id === currentUser?.id
  )?.role === 'admin';

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
          <Button
            onClick={() => router.push('/trips')}
            variant="contained"
            size="large"
          >
            返回旅行列表
          </Button>
        </Box>
      </Box>
    );
  }

  if (!trip) return null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={1} sx={{ bgcolor: 'white', color: 'text.primary' }}>
        <Toolbar>
          <IconButton
            onClick={() => router.push('/trips')}
            edge="start"
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
            {trip.name}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
          {/* 旅行資訊 */}
          <Box>
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  旅行資訊
                </Typography>
                {trip.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {trip.description}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Chip
                    label={`建立時間: ${new Date(trip.created_at).toLocaleDateString('zh-TW')}`}
                    size="small"
                  />
                </Box>

                {/* 分享功能 */}
                <Card variant="outlined" sx={{ bgcolor: 'primary.50', borderColor: 'primary.200' }}>
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                      分享此旅行
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        value={trip.hash_code}
                        size="small"
                        slotProps={{ input: { readOnly: true } }}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        variant="outlined"
                        startIcon={<ContentCopy />}
                        onClick={copyHashCode}
                      >
                        複製
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      分享此 ID 給朋友，他們就能加入旅行
                    </Typography>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* 支出列表 */}
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>
                    支出記錄
                  </Typography>
                  <Button
                    onClick={() => setShowAddExpense(true)}
                    variant="contained"
                    startIcon={<Add />}
                  >
                    新增支出
                  </Button>
                </Box>

                {expenses.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography variant="body1" color="text.secondary" gutterBottom>
                      目前還沒有支出記錄
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      點擊「新增支出」開始記錄!
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {expenses.map((expense) => (
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
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="subtitle1" fontWeight={600}>
                                {expense.description}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {expense.payer_name} 付款 • {new Date(expense.date).toLocaleDateString('zh-TW')}
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              {expense.currency !== 'TWD' ? (
                                <>
                                  <Typography variant="body2" color="text.secondary">
                                    {expense.original_amount.toLocaleString()} {expense.currency} (匯率 {expense.exchange_rate})
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
                              {currentUser?.id === expense.payer_id && (
                                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                  <Button
                                    onClick={() => handleEditExpenseClick(expense)}
                                    size="small"
                                    startIcon={<Edit />}
                                  >
                                    編輯
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteExpense(expense.id)}
                                    size="small"
                                    color="error"
                                    startIcon={<Delete />}
                                  >
                                    刪除
                                  </Button>
                                </Box>
                              )}
                            </Box>
                          </Box>
                          <Divider sx={{ my: 1.5 }} />
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            分帳對象:
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
                )}
              </CardContent>
            </Card>
          </Box>

          {/* 成員列表 */}
          <Box>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  成員 ({members.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {members.map((member) => (
                    <Box
                      key={member.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 1.5,
                        bgcolor: 'background.default',
                        borderRadius: 1,
                      }}
                    >
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        {member.display_name.charAt(0)}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1" fontWeight={500}>
                            {member.display_name}
                          </Typography>
                          {member.role === 'admin' && (
                            <Chip
                              label="管理員"
                              size="small"
                              color="primary"
                              icon={<AdminPanelSettings />}
                            />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          @{member.username}
                        </Typography>
                      </Box>
                      {/* 移除按鈕 - 僅管理員且不是自己 */}
                      {isCurrentUserAdmin && member.id !== currentUser?.id && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setRemoveMemberDialog({ open: true, member })}
                        >
                          <PersonRemove />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </Box>
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
                  查看結算
                </Button>
                <Typography variant="caption" color="text.secondary" textAlign="center" display="block" sx={{ mt: 1 }}>
                  查看每人應付/應收金額
                </Typography>
              </CardContent>
            </Card>

            {/* 危險操作區 - 僅管理員可見 */}
            {isCurrentUserAdmin && (
              <Card elevation={2} sx={{ mt: 3, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="error" gutterBottom fontWeight={600}>
                    危險操作
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Delete />}
                    fullWidth
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    刪除此旅行
                  </Button>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    刪除後將無法恢復，包括所有支出記錄
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
            新增支出
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
              <InputLabel>付款人 *</InputLabel>
              <Select
                value={expenseForm.payer_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, payer_id: typeof e.target.value === 'string' ? parseInt(e.target.value) : e.target.value })}
                label="付款人 *"
                required
              >
                <MenuItem value={0}>請選擇付款人</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.id} value={member.id}>
                    {member.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>幣別 *</InputLabel>
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
                label="幣別 *"
                required
              >
                <MenuItem value="TWD">TWD - 新台幣</MenuItem>
                <MenuItem value="JPY">JPY - 日圓</MenuItem>
                <MenuItem value="USD">USD - 美元</MenuItem>
                <MenuItem value="EUR">EUR - 歐元</MenuItem>
                <MenuItem value="HKD">HKD - 港幣</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                fullWidth
                type="number"
                label="金額 *"
                value={expenseForm.original_amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, original_amount: e.target.value })}
                required
                inputProps={{ step: '0.01', min: '0.01' }}
                placeholder="0.00"
              />

              {expenseForm.currency !== 'TWD' && (
                <TextField
                  fullWidth
                  type="number"
                  label="匯率 (對TWD) *"
                  value={expenseForm.exchange_rate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, exchange_rate: e.target.value })}
                  required
                  inputProps={{ step: '0.000001', min: '0' }}
                  placeholder="例如: 0.22"
                />
              )}
            </Box>

            {expenseForm.currency !== 'TWD' && (
              <Alert severity="info" icon={<AttachMoney />} sx={{ mb: 2 }}>
                換算後: <strong>NT${calculateAddExpenseConvertedAmount().toLocaleString()}</strong>
              </Alert>
            )}

            <TextField
              fullWidth
              label="項目描述 *"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              required
              placeholder="例如: 午餐、交通費"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              type="date"
              label="日期 *"
              value={expenseForm.date}
              onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              required
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                分帳對象 *
                {expenseForm.split_with.length > 0 && (
                  <Typography component="span" color="primary" sx={{ ml: 1 }}>
                    (已選 {expenseForm.split_with.length} 人)
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
              {expenseForm.split_with.length > 0 && expenseForm.original_amount && parseFloat(expenseForm.original_amount) > 0 && (
                <Alert severity="info" icon={<AttachMoney />} sx={{ mt: 1 }}>
                  每人分擔: <strong>NT${(calculateAddExpenseConvertedAmount() / expenseForm.split_with.length).toFixed(2)}</strong>
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
              取消
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={expenseForm.split_with.length === 0}
            >
              新增支出
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
        <DialogTitle>確認刪除旅行</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />}>
            此操作無法復原！
          </Alert>
          <Typography>
            確定要刪除「{trip?.name}」嗎？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            這將永久刪除：
          </Typography>
          <Box component="ul" sx={{ pl: 2, mt: 1 }}>
            <Typography component="li" variant="body2">所有成員記錄</Typography>
            <Typography component="li" variant="body2">所有支出記錄</Typography>
            <Typography component="li" variant="body2">所有分帳資料</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleDeleteTrip}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {isDeleting ? '刪除中...' : '確認刪除'}
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
        <DialogTitle>移除成員</DialogTitle>
        <DialogContent>
          <Typography>
            確定要將「{removeMemberDialog.member?.display_name}」移出旅行嗎？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            該成員的支出記錄將會保留
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveMemberDialog({ open: false, member: null })}>
            取消
          </Button>
          <Button
            onClick={() => handleRemoveMember(removeMemberDialog.member!.id)}
            color="error"
            variant="contained"
          >
            移除
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
          <DialogTitle>編輯支出</DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label="項目描述"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              margin="normal"
              required
            />

            <FormControl fullWidth margin="normal" required>
              <InputLabel>幣別</InputLabel>
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
                label="幣別"
              >
                <MenuItem value="TWD">TWD - 新台幣</MenuItem>
                <MenuItem value="JPY">JPY - 日圓</MenuItem>
                <MenuItem value="USD">USD - 美元</MenuItem>
                <MenuItem value="EUR">EUR - 歐元</MenuItem>
                <MenuItem value="HKD">HKD - 港幣</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="金額"
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
                  label="匯率 (對TWD)"
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
                換算後: {calculateConvertedAmount().toLocaleString()} TWD
              </Alert>
            )}

            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                以下欄位不可修改:
              </Typography>
              <Typography variant="body2">
                付款人: {editingExpense?.payer_name}
              </Typography>
              <Typography variant="body2">
                日期: {editingExpense ? new Date(editingExpense.date).toLocaleDateString('zh-TW') : ''}
              </Typography>
              <Typography variant="body2">
                分帳對象: {editingExpense?.splits.map(s => s.display_name).join(', ')}
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditExpenseDialog(false)}>取消</Button>
            <Button type="submit" variant="contained">儲存修改</Button>
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
