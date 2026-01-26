'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { TravelExplore, ArrowBack } from '@mui/icons-material';
import Navbar from '@/components/layout/Navbar';
import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin
        ? { username: formData.username, password: formData.password }
        : formData;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || (isLogin ? t('login.error') : t('register.error')));
      }

      router.push('/trips');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar showUserMenu={false} />

      <Box
        sx={{
          pt: { xs: 10, sm: 12 },
          pb: { xs: 4, sm: 6 },
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
        }}
      >
        <Container maxWidth="sm">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 5 },
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {/* Icon */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: '12px',
                bgcolor: 'primary.main',
                mx: 'auto',
                mb: 3,
              }}
            >
              <TravelExplore sx={{ fontSize: 32, color: 'white' }} />
            </Box>

            {/* 標題 */}
            <Typography
              variant="h4"
              align="center"
              fontWeight={700}
              sx={{
                mb: 1,
                color: 'text.primary',
                fontSize: { xs: '1.75rem', sm: '2rem' },
              }}
            >
              {isLogin ? t('login.title') : t('register.title')}
            </Typography>
            <Typography
              variant="body1"
              align="center"
              color="text.secondary"
              sx={{ mb: 4, fontSize: { xs: '0.875rem', sm: '1rem' } }}
            >
              {isLogin ? t('login.subtitle') : t('register.subtitle')}
            </Typography>

            {/* Tabs */}
            <Tabs
              value={isLogin ? 0 : 1}
              onChange={(_, newValue) => {
                setIsLogin(newValue === 0);
                setError('');
              }}
              variant="fullWidth"
              sx={{
                mb: 4,
                '& .MuiTab-root': {
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: { xs: '0.875rem', sm: '1rem' },
                },
              }}
            >
              <Tab label={t('login.loginButton')} />
              <Tab label={t('register.registerButton')} />
            </Tabs>

            {/* 錯誤訊息 */}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 3,
                  borderRadius: 2,
                }}
              >
                {error}
              </Alert>
            )}

            {/* 表單 */}
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label={t('login.username')}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                inputProps={{ minLength: 3 }}
                sx={{ mb: 2.5 }}
              />

              {!isLogin && (
                <TextField
                  fullWidth
                  label={t('register.displayName')}
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  required={!isLogin}
                  sx={{ mb: 2.5 }}
                />
              )}

              <TextField
                fullWidth
                type="password"
                label={t('login.password')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                inputProps={{ minLength: 6 }}
                helperText={!isLogin ? t('register.passwordHelp') : ''}
                sx={{ mb: 4 }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontSize: { xs: '1rem', sm: '1.1rem' },
                  fontWeight: 600,
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : isLogin ? (
                  t('login.loginButton')
                ) : (
                  t('register.registerButton')
                )}
              </Button>
            </form>

            {/* 返回首頁 */}
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Button
                component={Link}
                href="/"
                startIcon={<ArrowBack />}
                sx={{
                  textTransform: 'none',
                  color: 'text.secondary',
                  fontSize: { xs: '0.875rem', sm: '1rem' },
                  '&:hover': {
                    color: 'text.primary',
                  },
                }}
              >
                {t('login.backToHome')}
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}
