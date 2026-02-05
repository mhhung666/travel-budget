'use client';

import {
  Box,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Calendar,
  Wallet,
  Receipt,
  ArrowRight,
} from 'lucide-react';

interface StatsOverviewCardProps {
  totalAmount: number;
  totalExpenses: number;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  formatCurrency: (amount: number) => string;
  highlightGradient: string;
  t: (key: string) => string;
}

export default function StatsOverviewCard({
  totalAmount,
  totalExpenses,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  formatCurrency,
  highlightGradient,
  t,
}: StatsOverviewCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        mb: 5,
        background: highlightGradient,
        borderRadius: 4,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.25), 0 8px 10px -6px rgba(99, 102, 241, 0.25)',
        color: 'white',
      }}
    >
      {/* 裝飾性背景圖形 */}
      <Box
        sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -50,
          left: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(30px)',
        }}
      />

      <CardContent sx={{ position: 'relative', zIndex: 1, p: { xs: 3, md: 5 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
          <Box>
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
          </Box>

          {/* 日期過濾器 */}
          <Box
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(10px)',
              p: 3,
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.2)',
              minWidth: { md: 400 },
              width: { xs: '100%', md: 'auto' }
            }}
          >
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Calendar size={16} /> {t('dateRange')}
              </Typography>
              <Stack direction="row" spacing={2}>
                <TextField
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  variant="standard"
                  InputProps={{
                    disableUnderline: true,
                    sx: {
                      color: 'white',
                      bgcolor: 'rgba(255,255,255,0.1)',
                      borderRadius: 1,
                      px: 1.5,
                      py: 0.5,
                      fontSize: '0.875rem',
                      '& input::-webkit-calendar-picker-indicator': {
                        filter: 'invert(1)',
                        cursor: 'pointer'
                      }
                    }
                  }}
                  sx={{ flex: 1 }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center' }}><ArrowRight size={16} opacity={0.7} /></Box>
                <TextField
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  variant="standard"
                  InputProps={{
                    disableUnderline: true,
                    sx: {
                      color: 'white',
                      bgcolor: 'rgba(255,255,255,0.1)',
                      borderRadius: 1,
                      px: 1.5,
                      py: 0.5,
                      fontSize: '0.875rem',
                      '& input::-webkit-calendar-picker-indicator': {
                        filter: 'invert(1)',
                        cursor: 'pointer'
                      }
                    }
                  }}
                  slotProps={{
                    htmlInput: { min: startDate || undefined },
                  }}
                  sx={{ flex: 1 }}
                />
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
