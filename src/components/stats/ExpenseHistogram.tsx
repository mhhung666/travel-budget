'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { aggregateExpensesByInterval, suggestInterval } from '@/lib/histogram';
import type { CategoryStat, TimeInterval } from '@/types';

interface ExpenseHistogramProps {
  categoryStats: CategoryStat[];
  startDate: string;
  endDate: string;
  formatCurrency: (amount: number) => string;
  cardGradient: string;
  t: (key: string) => string;
  locale: string;
}

export default function ExpenseHistogram({
  categoryStats,
  startDate,
  endDate,
  formatCurrency,
  cardGradient,
  t,
  locale,
}: ExpenseHistogramProps) {
  const theme = useTheme();

  // 計算日期範圍天數
  const daysDiff = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  // 初始區間：智能推薦
  const defaultInterval = useMemo(
    () => (startDate && endDate ? suggestInterval(startDate, endDate) : 'day'),
    [startDate, endDate]
  );

  const [interval, setInterval] = useState<TimeInterval>(defaultInterval);

  // 根據日期範圍決定可用的區間選項
  const availableIntervals = useMemo(() => {
    const intervals: TimeInterval[] = [];

    // 按日：始終可用
    intervals.push('day');

    // 按週：> 2天時可用
    if (daysDiff > 2) {
      intervals.push('week');
    }

    // 按月：> 90天時可用
    if (daysDiff > 90) {
      intervals.push('month');
    }

    return intervals;
  }, [daysDiff]);

  // 當可用區間改變時，確保當前選擇的區間仍然可用
  useEffect(() => {
    if (!availableIntervals.includes(interval)) {
      // 如果當前區間不可用，切換到第一個可用的區間
      setInterval(availableIntervals[0] || 'day');
    }
  }, [availableIntervals, interval]);

  // 聚合數據
  const histogramData = useMemo(() => {
    if (!startDate || !endDate) return null;
    return aggregateExpensesByInterval(
      categoryStats,
      interval,
      startDate,
      endDate,
      locale
    );
  }, [categoryStats, interval, startDate, endDate, locale]);

  // 格式化日期範圍顯示
  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateFormat = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';

    if (startDate === endDate) {
      // 同一天
      return new Intl.DateTimeFormat(dateFormat, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(start);
    } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      // 同一個月
      return `${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(start)} - ${end.getDate()}`;
    } else if (start.getFullYear() === end.getFullYear()) {
      // 同一年
      return `${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(end)}`;
    } else {
      // 跨年
      return `${new Intl.DateTimeFormat(dateFormat, { year: 'numeric', month: 'short', day: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat(dateFormat, { year: 'numeric', month: 'short', day: 'numeric' }).format(end)}`;
    }
  };

  // 自定義 Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const data = payload[0].payload;

    return (
      <Box
        sx={{
          bgcolor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          p: 1.5,
          boxShadow: 3,
        }}
      >
        <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
          {formatDateRange(data.startDate, data.endDate)}
        </Typography>
        <Typography variant="h6" color="primary.main" fontWeight={700}>
          {formatCurrency(data.amount)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {data.count} {t('expenses')}
        </Typography>
      </Box>
    );
  };

  return (
    <Card
      elevation={0}
      sx={{
        background: cardGradient,
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        mb: 4,
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                p: 1,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.4)',
              }}
            >
              <BarChart3 size={20} />
            </Box>
            <Typography variant="h5" fontWeight={700}>
              {t('expenseHistogram')}
            </Typography>
          </Box>

          {/* 時間區間選擇器 */}
          <ToggleButtonGroup
            value={interval}
            exclusive
            onChange={(_, newInterval) => {
              if (newInterval) setInterval(newInterval);
            }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 2,
                py: 0.5,
                fontSize: '0.875rem',
                fontWeight: 600,
                border: `1px solid ${theme.palette.divider}`,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
                '&.Mui-disabled': {
                  opacity: 0.4,
                },
              },
            }}
          >
            <ToggleButton value="day" disabled={!availableIntervals.includes('day')}>
              {t('intervalDay')}
            </ToggleButton>
            <ToggleButton value="week" disabled={!availableIntervals.includes('week')}>
              {t('intervalWeek')}
            </ToggleButton>
            <ToggleButton value="month" disabled={!availableIntervals.includes('month')}>
              {t('intervalMonth')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Chart */}
        {histogramData && histogramData.dataPoints.length > 0 ? (
          <Box sx={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <BarChart data={histogramData.dataPoints} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis
                  dataKey="period"
                  stroke={theme.palette.text.secondary}
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  stroke={theme.palette.text.secondary}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: alpha(theme.palette.primary.main, 0.1) }} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {histogramData.dataPoints.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.amount > 0
                          ? theme.palette.primary.main
                          : alpha(theme.palette.text.disabled, 0.3)
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <BarChart3 size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 16 }} />
            <Typography variant="body1" color="text.secondary">
              {t('noData')}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
