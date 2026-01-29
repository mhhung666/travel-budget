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
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Avatar,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  ArrowRight,
  ArrowDown,
  Lightbulb,
  ArrowLeft,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Balance, Transaction } from '@/types';
import { getCurrentUser, getSettlement } from '@/actions';

export default function SettlementPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tSettlement = useTranslations('settlement');
  const tError = useTranslations('error');

  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettlement();
  }, [tripId]);

  const loadSettlement = async () => {
    try {
      // 嘗試檢查認證
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        setCurrentUser(userResult.data);
      }

      // 嘗試使用 Server Action
      if (userResult.success && userResult.data) {
        const result = await getSettlement(tripId);
        if (result.success) {
          setBalances(result.data.balances);
          setTransactions(result.data.transactions);
          setTotalExpenses(result.data.totalExpenses);
          return;
        }
        // 如果不是成員，繼續使用公開 API
        if (result.code !== 'FORBIDDEN') {
          throw new Error(result.error);
        }
      }

      // 未登入或非成員，使用公開 API
      const response = await fetch(`/api/public/trips/${tripId}/settlement`);

      if (!response.ok) {
        throw new Error(tError('loadSettlementFailed'));
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
          <Button onClick={() => router.push(`/trips/${tripId}`)} variant="contained" size="large">
            {tSettlement('backToTrip')}
          </Button>
        </Box>
      </Box>
    );
  }

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
        title={tSettlement('summary')}
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        {/* 返回按鈕 */}
        <Button
          startIcon={<ArrowLeft />}
          onClick={() => router.push(`/trips/${tripId}`)}
          sx={{
            mb: 3,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
            },
          }}
        >
          {tSettlement('backToTrip')}
        </Button>

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
              {tSettlement('totalExpenses')}
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              ${totalExpenses.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>

        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}
        >
          {/* 每人統計 */}
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {tSettlement('perPerson')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {balances.map((balance) => (
                  <Card
                    key={balance.userId}
                    elevation={0}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
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
                              <TrendingUp size={18} />
                            ) : balance.balance < 0 ? (
                              <TrendingDown size={18} />
                            ) : (
                              <CheckCircle size={18} />
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
                            {tSettlement('totalPaid')}
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            ${balance.totalPaid.toLocaleString()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">
                            {tSettlement('totalOwed')}
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            ${balance.totalOwed.toLocaleString()}
                          </Typography>
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" fontWeight={600}>
                            {tSettlement('status')}
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
                            {balance.balance > 0 ? tSettlement('shouldReceive') : balance.balance < 0 ? tSettlement('shouldPay') : tSettlement('settled')}
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
                  {tSettlement('plan')}
                </Typography>
                {transactions.length > 0 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    component="span"
                    sx={{ ml: 1 }}
                  >
                    ({transactions.length} {tSettlement('transferCount')})
                  </Typography>
                )}
              </Box>

              {transactions.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h5" gutterBottom>
                    🎉 {tSettlement('great')}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {tSettlement('noTransfers')}
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
                        <CardContent sx={{ p: '16px !important' }}>
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: { xs: 'column', sm: 'row' },
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: { xs: 1, sm: 2 },
                              width: '100%',
                            }}
                          >
                            {/* 付款人 */}
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                width: { xs: '100%', sm: 'auto' },
                                justifyContent: { xs: 'center', sm: 'flex-start' },
                              }}
                            >
                              <Avatar
                                sx={{
                                  bgcolor: 'error.main',
                                  color: 'white',
                                  border: '2px solid',
                                  borderColor: 'error.dark',
                                }}
                              >
                                {transaction.from.charAt(0)}
                              </Avatar>
                              <Box>
                                <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
                                  {tSettlement('payer')}
                                </Typography>
                                <Typography
                                  variant="body1"
                                  fontWeight={600}
                                  sx={{ color: 'rgba(0, 0, 0, 0.87)' }}
                                >
                                  {transaction.from}
                                </Typography>
                              </Box>
                            </Box>

                            {/* 金額與箭頭 */}
                            <Box sx={{ my: { xs: 1, sm: 0 }, textAlign: 'center' }}>
                              <Typography variant="h5" fontWeight={700} color="warning.dark">
                                ${transaction.amount.toFixed(0)}
                              </Typography>
                              <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                                <Box component="span" sx={{ color: 'text.secondary', display: 'flex' }}>
                                  <ArrowDown />
                                </Box>
                              </Box>
                              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                                <Box component="span" sx={{ color: 'text.secondary', display: 'flex' }}>
                                  <ArrowRight />
                                </Box>
                              </Box>
                            </Box>

                            {/* 收款人 */}
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                width: { xs: '100%', sm: 'auto' },
                                justifyContent: { xs: 'center', sm: 'flex-end' },
                              }}
                            >
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
                                  {tSettlement('payee')}
                                </Typography>
                                <Typography
                                  variant="body1"
                                  fontWeight={600}
                                  sx={{ color: 'rgba(0, 0, 0, 0.87)' }}
                                >
                                  {transaction.to}
                                </Typography>
                              </Box>
                              <Avatar
                                sx={{
                                  bgcolor: 'success.main',
                                  color: 'white',
                                  border: '2px solid',
                                  borderColor: 'success.dark',
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
                    <strong>{tSettlement('tip')}</strong>{' '}
                    {tSettlement('tipContent')}
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
