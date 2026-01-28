'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { Compass, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { login, register } from '@/actions';
import ForgotPasswordModal from './ForgotPasswordModal';

export default function LoginForm() {
  const router = useRouter();
  const t = useTranslations('auth');

  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = isLogin
        ? await login({ username: formData.username, password: formData.password })
        : await register({
            username: formData.username,
            display_name: formData.display_name,
            email: formData.email,
            password: formData.password,
          });

      if (!result.success) {
        throw new Error(result.error || (isLogin ? t('login.error') : t('register.error')));
      }

      router.push('/trips');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
          <Compass size={32} color="white" />
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
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
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
            <>
              <TextField
                fullWidth
                label={t('register.displayName')}
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                required={!isLogin}
                sx={{ mb: 2.5 }}
              />
              <TextField
                fullWidth
                type="email"
                label={t('register.email')}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                helperText={t('register.emailHelp')}
                sx={{ mb: 2.5 }}
              />
            </>
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
            sx={{ mb: isLogin ? 1 : 4 }}
          />

          {isLogin && (
            <Box sx={{ mb: 3, textAlign: 'right' }}>
              <Button
                size="small"
                onClick={() => setForgotPasswordOpen(true)}
                sx={{
                  textTransform: 'none',
                  color: 'text.secondary',
                  fontSize: '0.875rem',
                  '&:hover': {
                    color: 'primary.main',
                  },
                }}
              >
                {t('forgotPassword.link')}
              </Button>
            </Box>
          )}

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
            startIcon={<ArrowLeft />}
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

      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
      />
    </>
  );
}
