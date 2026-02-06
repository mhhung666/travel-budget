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
} from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Balance, Transaction } from '@/types';
import { getCurrentUser, getSettlement } from '@/actions';
import {
  SettlementSummary,
  SettlementBalances,
  SettlementPlan,
} from '@/components/settlement';

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
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ TWD: 1 });
  const [loadingRates, setLoadingRates] = useState(false);

  useEffect(() => {
    loadSettlement();
    loadExchangeRates();
  }, [tripId]);

  const loadExchangeRates = async () => {
    try {
      setLoadingRates(true);
      const response = await fetch('/api/exchange-rates');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.rates) {
          setExchangeRates(data.rates);
        }
      }
    } catch (err) {
      console.error('Failed to load exchange rates:', err);
    } finally {
      setLoadingRates(false);
    }
  };

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
        <SettlementSummary totalExpenses={totalExpenses} />

        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}
        >
          {/* 每人統計 */}
          <SettlementBalances balances={balances} />

          {/* 結算方案 */}
          <SettlementPlan
            transactions={transactions}
            exchangeRates={exchangeRates}
            loadingRates={loadingRates}
          />
        </Box>
      </Container>
    </Box>
  );
}
