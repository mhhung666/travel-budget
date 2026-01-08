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
} from '@mui/material';
import {
  ArrowBack,
  Add,
  Delete,
  Calculate,
  AttachMoney,
  Person,
  Close,
} from '@mui/icons-material';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
}

interface Expense {
  id: number;
  amount: number;
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
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    split_with: [] as number[],
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
          amount: parseFloat(expenseForm.amount),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowAddExpense(false);
      setExpenseForm({
        payer_id: currentUser?.id || 0,
        amount: '',
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

  const toggleSplitMember = (userId: number) => {
    setExpenseForm(prev => ({
      ...prev,
      split_with: prev.split_with.includes(userId)
        ? prev.split_with.filter(id => id !== userId)
        : [...prev.split_with, userId],
    }));
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
                  <Chip label={`旅行 ID: ${trip.id}`} size="small" />
                  <Chip
                    label={`建立時間: ${new Date(trip.created_at).toLocaleDateString('zh-TW')}`}
                    size="small"
                  />
                </Box>
                <Alert severity="info" icon={false}>
                  分享旅行 ID <strong>{trip.id}</strong> 給其他人,讓他們加入這個旅行!
                </Alert>
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
                              <Typography variant="h6" color="primary" fontWeight={700}>
                                ${expense.amount.toLocaleString()}
                              </Typography>
                              {currentUser?.id === expense.payer_id && (
                                <Button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  size="small"
                                  color="error"
                                  startIcon={<Delete />}
                                  sx={{ mt: 0.5 }}
                                >
                                  刪除
                                </Button>
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
                      <Box>
                        <Typography variant="body1" fontWeight={500}>
                          {member.display_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          @{member.username}
                        </Typography>
                      </Box>
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
                onChange={(e) => setExpenseForm({ ...expenseForm, payer_id: parseInt(e.target.value as string) })}
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

            <TextField
              fullWidth
              type="number"
              label="金額 *"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              required
              inputProps={{ step: '0.01', min: '0.01' }}
              placeholder="0.00"
              sx={{ mb: 2 }}
            />

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
              {expenseForm.split_with.length > 0 && expenseForm.amount && parseFloat(expenseForm.amount) > 0 && (
                <Alert severity="info" icon={<AttachMoney />} sx={{ mt: 1 }}>
                  每人分擔: <strong>${(parseFloat(expenseForm.amount) / expenseForm.split_with.length).toFixed(2)}</strong>
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
    </Box>
  );
}
