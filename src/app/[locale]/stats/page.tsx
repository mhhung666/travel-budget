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
} from '@mui/material';
import {
  ChevronDown,
  Globe,
  Grid2X2,
  Receipt,
  DollarSign,
  MapPin,
  Calendar,
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
  const tNav = useTranslations('nav');
  const tError = useTranslations('error');
  const locale = useLocale();

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
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
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

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* 日期篩選 */}
        <Card elevation={2} sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              {t('dateRange')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label={t('startDate')}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
                sx={{ minWidth: 200 }}
              />
              <TextField
                label={t('endDate')}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: startDate || undefined },
                }}
                sx={{ minWidth: 200 }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* 總計卡片 */}
        <Card
          elevation={3}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            mb: 3,
          }}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <DollarSign />
              <Typography variant="h6" fontWeight={600}>
                {t('totalSpent')}
              </Typography>
            </Box>
            <Typography variant="h3" fontWeight={700}>
              {formatCurrency(stats?.totalAmount || 0)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Receipt size={20} />
              <Typography variant="body1">
                {stats?.totalExpenses || 0} {t('expenses')}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}
        >
          {/* 分類統計 */}
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box component="span" sx={{ color: 'primary.main', display: 'flex' }}>
                  <Grid2X2 />
                </Box>
                <Typography variant="h6" fontWeight={600}>
                  {t('categoryStats')}
                </Typography>
              </Box>

              {stats?.categoryStats && stats.categoryStats.length > 0 ? (
                <Box>
                  {stats.categoryStats.map((cat) => (
                    <Accordion
                      key={cat.category}
                      elevation={0}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:before': { display: 'none' },
                        mb: 1,
                      }}
                    >
                      <AccordionSummary expandIcon={<ChevronDown />}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            pr: 2,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6" component="span">
                              {getCategoryIcon(cat.category)}
                            </Typography>
                            <Typography variant="body1" fontWeight={600}>
                              {tCategory(cat.category)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="body1" fontWeight={600} color="primary.main">
                              {formatCurrency(cat.total)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {cat.count} {t('expenses')}
                            </Typography>
                          </Box>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          {cat.details.map((detail) => (
                            <Box
                              key={detail.id}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                pl: 1,
                              }}
                            >
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" fontWeight={500}>
                                  {detail.description || t('noDescription')}
                                </Typography>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    mt: 0.5,
                                  }}
                                >
                                  <Box component="span" sx={{ color: 'text.secondary', display: 'flex' }}>
                                    <Calendar size={14} />
                                  </Box>
                                  <Typography variant="caption" color="text.secondary">
                                    {new Date(detail.date).toLocaleDateString(
                                      locale === 'zh'
                                        ? 'zh-TW'
                                        : locale === 'jp'
                                          ? 'ja-JP'
                                          : 'en-US'
                                    )}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    ·
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {detail.tripName}
                                  </Typography>
                                </Box>
                              </Box>
                              <Typography
                                variant="body2"
                                fontWeight={500}
                                color="text.secondary"
                                sx={{ ml: 2 }}
                              >
                                {formatCurrency(detail.amount)}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    {t('noData')}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* 國家統計 */}
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box component="span" sx={{ color: 'primary.main', display: 'flex' }}>
                  <Globe />
                </Box>
                <Typography variant="h6" fontWeight={600}>
                  {t('countryStats')}
                </Typography>
                {stats?.countries && stats.countries.length > 0 && (
                  <Chip
                    label={`${stats.countries.length} ${t('countries')}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>

              {stats?.countries && stats.countries.length > 0 ? (
                <Box>
                  {stats.countries.map((country) => (
                    <Accordion
                      key={country.country}
                      elevation={0}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:before': { display: 'none' },
                        mb: 1,
                      }}
                    >
                      <AccordionSummary expandIcon={<ChevronDown />}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            pr: 2,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h5" component="span">
                              {getCountryFlag(country.country_code)}
                            </Typography>
                            <Typography variant="body1" fontWeight={600}>
                              {country.country}
                            </Typography>
                          </Box>
                          <Chip
                            label={`${country.tripCount} ${t('trips')}`}
                            size="small"
                            color="default"
                          />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {country.regions.map((region) => (
                            <Box
                              key={region.name}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pl: 2,
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box component="span" sx={{ color: 'action.active', display: 'flex' }}>
                                  <MapPin size={20} />
                                </Box>
                                <Typography variant="body2">{region.name}</Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary">
                                {region.tripCount} {t('trips')}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    {t('noData')}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
}
