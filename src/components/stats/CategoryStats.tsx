'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronDown, Grid2X2, Receipt, Calendar } from 'lucide-react';
import { getCategoryIcon } from '@/constants/categories';
import type { CategoryStat } from '@/types';

interface CategoryStatsProps {
  categoryStats: CategoryStat[];
  cardGradient: string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  t: (key: string) => string;
  tCategory: (key: string) => string;
}

export default function CategoryStats({
  categoryStats,
  cardGradient,
  formatCurrency,
  formatDate,
  t,
  tCategory,
}: CategoryStatsProps) {
  const theme = useTheme();

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.4)'
          }}
        >
          <Grid2X2 size={20} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          {t('categoryStats')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {categoryStats.length > 0 ? (
          categoryStats.map((cat, index) => (
            <Accordion
              key={cat.category}
              elevation={0}
              disableGutters
              sx={{
                background: cardGradient,
                borderRadius: '16px !important',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:before': { display: 'none' },
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 20px -10px rgba(0, 0, 0, 0.1)',
                  borderColor: 'primary.light',
                },
                animation: `fadeIn 0.5s ease-out ${index * 0.1}s both`,
              }}
            >
              <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                      sx={{
                        width: 40, height: 40,
                        borderRadius: '12px',
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.25rem'
                      }}
                    >
                      {getCategoryIcon(cat.category)}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {tCategory(cat.category)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        {cat.count} {t('expenses')}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="h6" fontWeight={700} color="primary.main">
                    {formatCurrency(cat.total)}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 2 }}>
                <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
                <Stack spacing={1.5}>
                  {cat.details.map((detail) => (
                    <Box
                      key={detail.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.5,
                        borderRadius: 3,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                        '&:hover': { bgcolor: alpha(theme.palette.background.default, 1) }
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1, mr: 2 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {detail.description || t('noDescription')}
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={1} mt={0.5}>
                          <Calendar size={12} color={theme.palette.text.secondary} />
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(detail.date)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">·</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {detail.tripName}
                          </Typography>
                        </Stack>
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="text.primary">
                        {formatCurrency(detail.amount)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))
        ) : (
          <Box sx={{ textAlign: 'center', py: 8, opacity: 0.6 }}>
            <Receipt size={48} strokeWidth={1} style={{ marginBottom: 16 }} />
            <Typography variant="body1" color="text.secondary">
              {t('noData')}
            </Typography>
          </Box>
        )}
      </Box>
    </>
  );
}
