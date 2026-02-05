'use client';

import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import {
  Wallet,
  Receipt,
} from 'lucide-react';

interface StatsSummaryCardProps {
  totalAmount: number;
  totalExpenses: number;
  formatCurrency: (amount: number) => string;
  t: (key: string) => string;
}

export default function StatsSummaryCard({
  totalAmount,
  totalExpenses,
  formatCurrency,
  t,
}: StatsSummaryCardProps) {
  const highlightGradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';

  return (
    <Card
      elevation={0}
      sx={{
        background: highlightGradient,
        borderRadius: 4,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.25), 0 8px 10px -6px rgba(99, 102, 241, 0.25)',
        color: 'white',
        height: '100%',
      }}
    >
      {/* 裝飾性背景圖形 */}
      <Box
        sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(40px)',
        }}
      />

      <CardContent sx={{ position: 'relative', zIndex: 1, p: { xs: 3, md: 4 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, opacity: 0.9 }}>
          <Wallet size={20} />
          <Typography variant="subtitle1" fontWeight={500}>
            {t('totalSpent')}
          </Typography>
        </Stack>
        <Typography variant="h2" fontWeight={800} sx={{ letterSpacing: '-0.02em', mb: 1 }}>
          {formatCurrency(totalAmount)}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ opacity: 0.9 }}>
          <Receipt size={16} />
          <Typography variant="body2" fontWeight={500}>
            {totalExpenses} {t('expenses')}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
