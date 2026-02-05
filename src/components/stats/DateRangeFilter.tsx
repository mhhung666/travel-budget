'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Calendar,
  ArrowRight,
} from 'lucide-react';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onYearSelect: (year: number) => void;
  t: (key: string) => string;
}

// 日期範圍計算輔助函數
const getDateRanges = () => {
  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  return {
    last7Days: {
      start: formatDate(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    last30Days: {
      start: formatDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    last90Days: {
      start: formatDate(new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    thisMonth: {
      start: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    },
    lastMonth: {
      start: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      end: formatDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    thisQuarter: {
      start: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)),
      end: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)),
    },
    lastQuarter: {
      start: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 - 3, 1)),
      end: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 0)),
    },
  };
};

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onYearSelect,
  t,
}: DateRangeFilterProps) {
  const theme = useTheme();
  const cardGradient = theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const dateRanges = getDateRanges();

  const isYearSelected = (year: number) => {
    return startDate === `${year}-01-01` && endDate === `${year}-12-31`;
  };

  const isRangeSelected = (range: { start: string; end: string }) => {
    return startDate === range.start && endDate === range.end;
  };

  const handleQuickSelect = (range: { start: string; end: string }) => {
    onStartDateChange(range.start);
    onEndDateChange(range.end);
  };

  return (
    <Card
      elevation={0}
      sx={{
        background: cardGradient,
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        height: '100%',
      }}
    >
      <CardContent sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar size={20} color={theme.palette.primary.main} />
            <Typography variant="h6" fontWeight={700}>
              {t('dateRange')}
            </Typography>
          </Box>

          {/* 相對時間快捷選項 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('quickRelative')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label={t('last7Days')}
                onClick={() => handleQuickSelect(dateRanges.last7Days)}
                variant={isRangeSelected(dateRanges.last7Days) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.last7Days) ? 'primary' : 'default'}
                size="small"
              />
              <Chip
                label={t('last30Days')}
                onClick={() => handleQuickSelect(dateRanges.last30Days)}
                variant={isRangeSelected(dateRanges.last30Days) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.last30Days) ? 'primary' : 'default'}
                size="small"
              />
              <Chip
                label={t('last90Days')}
                onClick={() => handleQuickSelect(dateRanges.last90Days)}
                variant={isRangeSelected(dateRanges.last90Days) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.last90Days) ? 'primary' : 'default'}
                size="small"
              />
            </Stack>
          </Box>

          {/* 絕對時間快捷選項 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('quickAbsolute')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label={t('thisMonth')}
                onClick={() => handleQuickSelect(dateRanges.thisMonth)}
                variant={isRangeSelected(dateRanges.thisMonth) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.thisMonth) ? 'primary' : 'default'}
                size="small"
              />
              <Chip
                label={t('lastMonth')}
                onClick={() => handleQuickSelect(dateRanges.lastMonth)}
                variant={isRangeSelected(dateRanges.lastMonth) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.lastMonth) ? 'primary' : 'default'}
                size="small"
              />
              <Chip
                label={t('thisQuarter')}
                onClick={() => handleQuickSelect(dateRanges.thisQuarter)}
                variant={isRangeSelected(dateRanges.thisQuarter) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.thisQuarter) ? 'primary' : 'default'}
                size="small"
              />
              <Chip
                label={t('lastQuarter')}
                onClick={() => handleQuickSelect(dateRanges.lastQuarter)}
                variant={isRangeSelected(dateRanges.lastQuarter) ? 'filled' : 'outlined'}
                color={isRangeSelected(dateRanges.lastQuarter) ? 'primary' : 'default'}
                size="small"
              />
            </Stack>
          </Box>

          {/* 年度快速選擇 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('quickYear')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {years.map((year) => (
                <Chip
                  key={year}
                  label={`${year}`}
                  onClick={() => onYearSelect(year)}
                  variant={isYearSelected(year) ? 'filled' : 'outlined'}
                  color={isYearSelected(year) ? 'primary' : 'default'}
                  size="small"
                  sx={{
                    fontWeight: isYearSelected(year) ? 700 : 500,
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* 自訂日期範圍 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('customRange')}
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <ArrowRight size={16} color={theme.palette.text.secondary} />
              <TextField
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                size="small"
                slotProps={{
                  htmlInput: { min: startDate || undefined },
                }}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
