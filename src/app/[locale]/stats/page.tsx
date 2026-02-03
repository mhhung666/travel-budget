'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  useTheme,
  Grid,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ChevronDown,
  Globe,
  Grid2X2,
  Receipt,
  MapPin,
  Calendar,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { getCategoryIcon } from '@/constants/categories';
import { getCountryFlag } from '@/constants/countries';
import type { StatsData } from '@/types';
import { getCurrentUser, getStats } from '@/actions';

export default function StatsPage() {
  const router = useRouter();
  const t = useTranslations('stats');
  const tCategory = useTranslations('category');
  const locale = useLocale();
  const theme = useTheme();

  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadStatsData();
    }
  }, [user, startDate, endDate]);

  const loadUser = async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Load user error:', error);
      router.push('/login');
    }
  };

  const loadStatsData = async () => {
    try {
      setLoading(true);
      const result = await getStats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setStats(result.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading && !stats) {
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
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  const cardGradient = theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';

  const highlightGradient = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      <Navbar
        user={
          user
            ? {
              id: user.id,
              username: user.display_name || user.username,
              email: user.email,
            }
            : null
        }
        showUserMenu={true}
        title={t('title')}
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 12, sm: 14 } }}>
        <Box
          sx={{
            animation: 'fadeIn 0.6s ease-out',
            '@keyframes fadeIn': {
              '0%': { opacity: 0, transform: 'translateY(20px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 4, borderRadius: 3 }}>
              {error}
            </Alert>
          )}

          {/* 頂部總覽區塊 - 使用 Glassmorphism 與高級漸層 */}
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
                    {formatCurrency(stats?.totalAmount || 0)}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ opacity: 0.9 }}>
                    <Receipt size={16} />
                    <Typography variant="body2" fontWeight={500}>
                      {stats?.totalExpenses || 0} {t('expenses')}
                    </Typography>
                  </Stack>
                </Box>

                {/* 日期過濾器 - 整合在頂部卡片中 */}
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
                        onChange={(e) => setStartDate(e.target.value)}
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
                        onChange={(e) => setEndDate(e.target.value)}
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

          <Grid container spacing={4}>
            {/* 分類統計 */}
            <Grid size={{ xs: 12, lg: 6 }}>
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
                {stats?.categoryStats && stats.categoryStats.length > 0 ? (
                  stats.categoryStats.map((cat, index) => (
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
                                    {new Date(detail.date).toLocaleDateString(
                                      locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                                    )}
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
            </Grid>

            {/* 國家統計 */}
            <Grid size={{ xs: 12, lg: 6 }}>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor: 'secondary.main',
                    color: 'secondary.contrastText',
                    display: 'flex',
                    boxShadow: '0 4px 6px -1px rgba(100, 116, 139, 0.4)'
                  }}
                >
                  <Globe size={20} />
                </Box>
                <Typography variant="h5" fontWeight={700}>
                  {t('countryStats')}
                </Typography>
                {stats?.countries && stats.countries.length > 0 && (
                  <Chip
                    label={`${stats.countries.length}`}
                    size="small"
                    sx={{ borderRadius: '6px', fontWeight: 700, bgcolor: alpha(theme.palette.secondary.main, 0.1), color: 'secondary.main' }}
                  />
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stats?.countries && stats.countries.length > 0 ? (
                  stats.countries.map((country, index) => (
                    <Accordion
                      key={country.country}
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
                          borderColor: 'secondary.light',
                        },
                        animation: `fadeIn 0.5s ease-out ${index * 0.1 + 0.2}s both`,
                      }}
                    >
                      <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                        <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box
                              sx={{
                                width: 48, height: 40,
                                fontSize: '2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                lineHeight: 1
                              }}
                            >
                              {getCountryFlag(country.country_code)}
                            </Box>
                            <Box>
                              <Typography variant="subtitle1" fontWeight={600}>
                                {country.country}
                              </Typography>
                            </Box>
                          </Stack>
                          <Chip
                            label={`${country.tripCount} ${t('trips')}`}
                            size="small"
                            sx={{ borderRadius: '8px', fontWeight: 600 }}
                          />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0, pb: 2 }}>
                        <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
                        <Stack spacing={1}>
                          {country.regions.map((region) => (
                            <Box
                              key={region.name}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1.5,
                                borderRadius: 3,
                                border: '1px solid',
                                borderColor: 'divider',
                                '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.1) }
                              }}
                            >
                              <Stack direction="row" alignItems="center" spacing={1.5}>
                                <MapPin size={18} className="text-gray-400" />
                                <Typography variant="body2" fontWeight={500}>{region.name}</Typography>
                              </Stack>
                              <Badge count={region.tripCount} label={t('trips')} />
                            </Box>
                          ))}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  ))
                ) : (
                  <Box sx={{ textAlign: 'center', py: 8, opacity: 0.6 }}>
                    <Globe size={48} strokeWidth={1} style={{ marginBottom: 16 }} />
                    <Typography variant="body1" color="text.secondary">
                      {t('noData')}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
}

// 輔助組件
function Badge({ count, label }: { count: number; label: string }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5,
      bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 2
    }}>
      <Typography variant="body2" fontWeight={700} color="primary.main">{count}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
