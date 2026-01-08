'use client';

import { Box, Container, Typography, Button, Card, CardContent, Grid, Avatar } from '@mui/material';
import { CreditCard, Add, Calculate, Payments, ArrowForward } from '@mui/icons-material';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

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
      }}
    >
      {/* 背景裝飾 */}
      <Box
        sx={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(100px)',
          top: '-200px',
          right: '-200px',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          filter: 'blur(100px)',
          bottom: '-150px',
          left: '-150px',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box textAlign="center" py={8}>
          {/* Logo */}
          <Avatar
            sx={{
              width: 80,
              height: 80,
              mx: 'auto',
              mb: 4,
              bgcolor: 'white',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <CreditCard sx={{ fontSize: 40, color: 'primary.main' }} />
          </Avatar>

          {/* 標題 */}
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              color: 'white',
              mb: 2,
              textShadow: '0 2px 10px rgba(0,0,0,0.1)',
            }}
          >
            旅行分帳 App
          </Typography>
          <Typography
            variant="h5"
            sx={{
              color: 'rgba(255, 255, 255, 0.95)',
              mb: 1,
              fontWeight: 600,
            }}
          >
            輕鬆管理旅行支出
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'rgba(255, 255, 255, 0.8)',
              mb: 6,
              maxWidth: '600px',
              mx: 'auto',
            }}
          >
            智慧計算分帳，讓旅行更簡單
          </Typography>

          {/* 功能特色 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, mb: 6, maxWidth: '900px', mx: 'auto' }}>
            <Card
                sx={{
                  height: '100%',
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                  },
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Avatar
                    sx={{
                      width: 60,
                      height: 60,
                      mx: 'auto',
                      mb: 2,
                      bgcolor: 'primary.light',
                    }}
                  >
                    <Add sx={{ fontSize: 30 }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    輕鬆記帳
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    快速記錄每筆支出
                  </Typography>
                </CardContent>
              </Card>
            <Card
                sx={{
                  height: '100%',
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                  },
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Avatar
                    sx={{
                      width: 60,
                      height: 60,
                      mx: 'auto',
                      mb: 2,
                      bgcolor: 'secondary.light',
                    }}
                  >
                    <Calculate sx={{ fontSize: 30 }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    智能分帳
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    自動計算應付金額
                  </Typography>
                </CardContent>
              </Card>
            <Card
                sx={{
                  height: '100%',
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                  },
                }}
              >
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Avatar
                    sx={{
                      width: 60,
                      height: 60,
                      mx: 'auto',
                      mb: 2,
                      bgcolor: 'success.light',
                    }}
                  >
                    <Payments sx={{ fontSize: 30 }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    一鍵結算
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    最優化轉帳方案
                  </Typography>
                </CardContent>
              </Card>
          </Box>

          {/* 按鈕 */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              onClick={() => router.push('/login')}
              variant="contained"
              size="large"
              endIcon={<ArrowForward />}
              sx={{
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
                fontWeight: 600,
                bgcolor: 'white',
                color: 'primary.main',
                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.95)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 15px 40px rgba(0,0,0,0.3)',
                },
                transition: 'all 0.3s',
              }}
            >
              開始使用
            </Button>
            <Button
              onClick={() => router.push('/trips')}
              variant="outlined"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'white',
                borderColor: 'white',
                '&:hover': {
                  borderColor: 'white',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.3s',
              }}
            >
              查看旅行
            </Button>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
