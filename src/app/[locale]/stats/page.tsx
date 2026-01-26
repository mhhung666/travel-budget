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
  ExpandMore,
  Public,
  Category,
  Receipt,
  AttachMoney,
  Place,
} from '@mui/icons-material';
import Navbar from '@/components/layout/Navbar';
import { getCategoryIcon } from '@/constants/categories';

interface CategoryStat {
  category: string;
  total: number;
  count: number;
}

interface RegionStat {
  name: string;
  tripCount: number;
}

interface CountryStat {
  country: string;
  country_code: string;
  tripCount: number;
  regions: RegionStat[];
}

interface StatsData {
  categoryStats: CategoryStat[];
  countries: CountryStat[];
  totalAmount: number;
  totalExpenses: number;
}

// 國旗 emoji 對照（常見國家）
const countryFlags: Record<string, string> = {
  JP: '\uD83C\uDDEF\uD83C\uDDF5',
  CN: '\uD83C\uDDE8\uD83C\uDDF3',
  TW: '\uD83C\uDDF9\uD83C\uDDFC',
  HK: '\uD83C\uDDED\uD83C\uDDF0',
  KR: '\uD83C\uDDF0\uD83C\uDDF7',
  TH: '\uD83C\uDDF9\uD83C\uDDED',
  VN: '\uD83C\uDDFB\uD83C\uDDF3',
  SG: '\uD83C\uDDF8\uD83C\uDDEC',
  MY: '\uD83C\uDDF2\uD83C\uDDFE',
  US: '\uD83C\uDDFA\uD83C\uDDF8',
  GB: '\uD83C\uDDEC\uD83C\uDDE7',
  FR: '\uD83C\uDDEB\uD83C\uDDF7',
  DE: '\uD83C\uDDE9\uD83C\uDDEA',
  IT: '\uD83C\uDDEE\uD83C\uDDF9',
  ES: '\uD83C\uDDEA\uD83C\uDDF8',
  AU: '\uD83C\uDDE6\uD83C\uDDFA',
  NZ: '\uD83C\uDDF3\uD83C\uDDFF',
};

function getCountryFlag(countryCode: string): string {
  return countryFlags[countryCode] || '\uD83C\uDF0D';
}

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
      loadStats();
    }
  }, [user, startDate, endDate]);

  const loadUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Load user error:', error);
      router.push('/login');
    }
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await fetch(`/api/stats?${params.toString()}`);

      if (!response.ok) {
        throw new Error(tError('loadFailed'));
      }

      const data = await response.json();
      setStats(data);
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
              <AttachMoney />
              <Typography variant="h6" fontWeight={600}>
                {t('totalSpent')}
              </Typography>
            </Box>
            <Typography variant="h3" fontWeight={700}>
              {formatCurrency(stats?.totalAmount || 0)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Receipt fontSize="small" />
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
                <Category color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  {t('categoryStats')}
                </Typography>
              </Box>

              {stats?.categoryStats && stats.categoryStats.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {stats.categoryStats.map((cat) => (
                    <Card
                      key={cat.category}
                      elevation={0}
                      sx={{ border: '1px solid', borderColor: 'divider' }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6" component="span">
                              {getCategoryIcon(cat.category)}
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
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
                      </CardContent>
                    </Card>
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
                <Public color="primary" />
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
                      <AccordionSummary expandIcon={<ExpandMore />}>
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
                                <Place fontSize="small" color="action" />
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
