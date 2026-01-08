'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Avatar,
  Alert,
  CircularProgress,
  Link as MuiLink,
  Tabs,
  Tab,
} from '@mui/material';
import { Person, ArrowBack } from '@mui/icons-material';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
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
        throw new Error(data.error || '操作失敗');
      }

      router.push('/trips');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        overflow: 'hidden',
        p: 2,
      }}
    >
      {/* 背景裝飾 */}
      <Box
        sx={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(100px)',
          top: '100px',
          right: '100px',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(100px)',
          bottom: '100px',
          left: '100px',
        }}
      />

      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Paper
          elevation={10}
          sx={{
            p: 4,
            borderRadius: 3,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Logo */}
          <Avatar
            sx={{
              width: 64,
              height: 64,
              mx: 'auto',
              mb: 3,
              bgcolor: 'primary.main',
              boxShadow: 3,
            }}
          >
            <Person sx={{ fontSize: 32 }} />
          </Avatar>

          {/* 標題 */}
          <Typography
            variant="h4"
            align="center"
            fontWeight={700}
            sx={{
              mb: 1,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {isLogin ? '歡迎回來' : '加入我們'}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 4 }}>
            {isLogin ? '登入您的帳號開始管理旅行' : '建立帳號開始您的旅程'}
          </Typography>

          {/* Tabs */}
          <Tabs
            value={isLogin ? 0 : 1}
            onChange={(_, newValue) => {
              setIsLogin(newValue === 0);
              setError('');
            }}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab label="登入" />
            <Tab label="註冊" />
          </Tabs>

          {/* 錯誤訊息 */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* 表單 */}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="用戶名"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              inputProps={{ minLength: 3 }}
              sx={{ mb: 2 }}
            />

            {!isLogin && (
              <TextField
                fullWidth
                label="顯示名稱"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                required={!isLogin}
                sx={{ mb: 2 }}
              />
            )}

            <TextField
              fullWidth
              type="password"
              label="密碼"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              inputProps={{ minLength: 6 }}
              helperText={!isLogin ? '至少 6 個字元' : ''}
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: 3,
                '&:hover': {
                  boxShadow: 6,
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                isLogin ? '登入' : '註冊'
              )}
            </Button>
          </form>

          {/* 返回首頁 */}
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button
              component={Link}
              href="/"
              startIcon={<ArrowBack />}
              color="inherit"
              sx={{ textTransform: 'none' }}
            >
              返回首頁
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
