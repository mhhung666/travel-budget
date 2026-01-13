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
import Navbar from '@/components/Navbar';

export default function SettingsPage() {
  const router = useRouter();
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
        throw new Error(data.error || '更新失敗');
      }

      setSuccess('顯示名稱已更新');
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
      setError('新密碼至少需要 6 個字元');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('新密碼與確認密碼不符');
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
        throw new Error(data.error || '更新密碼失敗');
      }

      setSuccess('密碼已更新');
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
      <Navbar user={user} title="個人設定" />

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
            返回我的旅行
          </Button>

          {/* 標題 */}
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{ mb: 4, color: 'text.primary' }}
          >
            個人設定
          </Typography>

          {/* 訊息提示 */}
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccess('')}>
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
                個人資料
              </Typography>
            </Box>

            <form onSubmit={handleUpdateProfile}>
              <TextField
                fullWidth
                label="用戶名"
                value={user?.username || ''}
                disabled
                sx={{ mb: 3 }}
                helperText="用戶名無法修改"
              />

              <TextField
                fullWidth
                label="顯示名稱"
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
                  '儲存變更'
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
                修改密碼
              </Typography>
            </Box>

            <form onSubmit={handleUpdatePassword}>
              <TextField
                fullWidth
                type="password"
                label="目前密碼"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                type="password"
                label="新密碼"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                inputProps={{ minLength: 6 }}
                helperText="至少 6 個字元"
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                type="password"
                label="確認新密碼"
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
                  '更新密碼'
                )}
              </Button>
            </form>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}
