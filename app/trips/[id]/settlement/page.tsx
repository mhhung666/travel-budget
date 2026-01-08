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
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Divider,
  Avatar,
} from '@mui/material';
import {
  ArrowBack,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  ArrowForward,
  Lightbulb,
} from '@mui/icons-material';

interface Balance {
  userId: number;
  username: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
}

interface Transaction {
  from: string;
  to: string;
  amount: number;
}

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettlement();
  }, [tripId]);

  const loadSettlement = async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}/settlement`);

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('無法載入結算資料');
      }

      const data = await response.json();
      setBalances(data.balances);
      setTransactions(data.transactions);
      setTotalExpenses(data.totalExpenses);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <Button
            onClick={() => router.push(`/trips/${tripId}`)}
            variant="contained"
            size="large"
          >
            返回旅行詳情
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={1} sx={{ bgcolor: 'white', color: 'text.primary' }}>
        <Toolbar>
          <IconButton
            onClick={() => router.push(`/trips/${tripId}`)}
            edge="start"
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
            結算總覽
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* 總支出 */}
        <Card
          elevation={3}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            mb: 3,
          }}
        >
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              總支出
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              ${totalExpenses.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
          {/* 每人統計 */}
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                每人統計
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {balances.map((balance) => (
                  <Card
                    key={balance.userId}
                    elevation={0}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                            {balance.username.charAt(0)}
                          </Avatar>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {balance.username}
                          </Typography>
                        </Box>
                        <Chip
                          icon={
                            balance.balance > 0 ? (
                              <TrendingUp />
                            ) : balance.balance < 0 ? (
                              <TrendingDown />
                            ) : (
                              <CheckCircle />
                            )
                          }
                          label={`${balance.balance >= 0 ? '+' : ''}$${balance.balance.toFixed(0)}`}
                          color={
                            balance.balance > 0
                              ? 'success'
                              : balance.balance < 0
                              ? 'error'
                              : 'default'
                          }
                          sx={{ fontWeight: 700 }}
                        />
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            總付款:
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            ${balance.totalPaid.toLocaleString()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            總應付:
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            ${balance.totalOwed.toLocaleString()}
                          </Typography>
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" fontWeight={600}>
                            狀態:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color={
                              balance.balance > 0
                                ? 'success.main'
                                : balance.balance < 0
                                ? 'error.main'
                                : 'text.secondary'
                            }
                          >
                            {balance.balance > 0
                              ? '應收'
                              : balance.balance < 0
                              ? '應付'
                              : '已結清'}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* 結算方案 */}
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={600} component="span">
                  結算方案
                </Typography>
                {transactions.length > 0 && (
                  <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                    (共 {transactions.length} 筆轉帳)
                  </Typography>
                )}
              </Box>

              {transactions.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h5" gutterBottom>
                    🎉 太好了!
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    所有帳目已結清,無需進行轉帳
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {transactions.map((transaction, index) => (
                      <Card
                        key={index}
                        elevation={0}
                        sx={{
                          background: 'linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%)',
                          border: '2px solid',
                          borderColor: 'warning.light',
                        }}
                      >
                        <CardContent>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 2,
                            }}
                          >
                            {/* 付款人 */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar
                                sx={{
                                  bgcolor: 'white',
                                  color: 'text.primary',
                                  border: '2px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                {transaction.from.charAt(0)}
                              </Avatar>
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  付款人
                                </Typography>
                                <Typography variant="body1" fontWeight={600}>
                                  {transaction.from}
                                </Typography>
                              </Box>
                            </Box>

                            {/* 金額 */}
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h5" fontWeight={700} color="warning.dark">
                                ${transaction.amount.toFixed(0)}
                              </Typography>
                              <ArrowForward sx={{ fontSize: 16, color: 'text.secondary' }} />
                            </Box>

                            {/* 收款人 */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" color="text.secondary">
                                  收款人
                                </Typography>
                                <Typography variant="body1" fontWeight={600}>
                                  {transaction.to}
                                </Typography>
                              </Box>
                              <Avatar
                                sx={{
                                  bgcolor: 'white',
                                  color: 'text.primary',
                                  border: '2px solid',
                                  borderColor: 'divider',
                                }}
                              >
                                {transaction.to.charAt(0)}
                              </Avatar>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>

                  <Alert severity="info" icon={<Lightbulb />} sx={{ mt: 3 }}>
                    <strong>提示:</strong> 這是經過優化的最少轉帳次數方案,按照此方案進行轉帳即可完成結算。
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
}
