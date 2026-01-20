'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
} from '@mui/material';
import { ArrowBack, Person, Lock } from '@mui/icons-material';
import Navbar from '@/components/layout/Navbar';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 表單狀態
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 提交狀態
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setDisplayName(data.user.display_name);
      }
    } catch (error) {
      console.error('獲取用戶資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUpdatingProfile(true);

    try {
      const response = await fetch('/api/auth/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.updateFailed'));
      }

      setSuccess(t('profile.updateSuccess'));
      setUser({ ...user, display_name: displayName });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 驗證新密碼
    if (newPassword.length < 6) {
      setError(t('password.tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    setUpdatingPassword(true);

    try {
      const response = await fetch('/api/auth/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('password.updateError'));
      }

      setSuccess(t('password.updateSuccess'));
      // 清空密碼欄位
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar user={user} title={t('title')} />

      <Box sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        <Container maxWidth="md">
          {/* 返回按鈕 */}
          <Button
            startIcon={<ArrowBack />}
            onClick={() => router.push('/trips')}
            sx={{
              mb: 3,
              textTransform: 'none',
              color: 'text.secondary',
              '&:hover': {
                color: 'text.primary',
              },
            }}
          >
            {t('backToTrips')}
          </Button>

          {/* 標題 */}
          <Typography variant="h4" fontWeight={700} sx={{ mb: 4, color: 'text.primary' }}>
            {t('title')}
          </Typography>

          {/* 訊息提示 */}
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert
              severity="success"
              sx={{ mb: 3, borderRadius: 2 }}
              onClose={() => setSuccess('')}
            >
              {success}
            </Alert>
          )}

          {/* 個人資料設定 */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              mb: 3,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Person sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                {t('profile.title')}
              </Typography>
            </Box>

            <form onSubmit={handleUpdateProfile}>
              <TextField
                fullWidth
                label={t('profile.username')}
                value={user?.username || ''}
                disabled
                sx={{ mb: 3 }}
                helperText={t('profile.usernameHelp')}
              />

              <TextField
                fullWidth
                label={t('profile.displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={updatingProfile || displayName === user?.display_name}
                sx={{
                  px: 4,
                  py: 1.2,
                  fontWeight: 600,
                }}
              >
                {updatingProfile ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t('profile.saveChanges')
                )}
              </Button>
            </form>
          </Paper>

          {/* 密碼設定 */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Lock sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight={600}>
                {t('password.title')}
              </Typography>
            </Box>

            <form onSubmit={handleUpdatePassword}>
              <TextField
                fullWidth
                type="password"
                label={t('password.current')}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                type="password"
                label={t('password.new')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                inputProps={{ minLength: 6 }}
                helperText={t('password.minLength')}
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                type="password"
                label={t('password.confirm')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                inputProps={{ minLength: 6 }}
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={updatingPassword}
                sx={{
                  px: 4,
                  py: 1.2,
                  fontWeight: 600,
                }}
              >
                {updatingPassword ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t('password.updateButton')
                )}
              </Button>
            </form>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}
