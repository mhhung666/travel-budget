'use client';

import { Box, Container, Typography, Button, Card, CardContent } from '@mui/material';
import { TravelExplore, Add, Calculate, Payments, ArrowForward } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function Home() {
  const router = useRouter();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar showUserMenu={false} title="旅行記帳" />

      {/* Hero Section */}
      <Box
        sx={{
          pt: { xs: 12, sm: 16 },
          pb: { xs: 8, sm: 12 },
          minHeight: { xs: 'calc(100vh - 64px)', sm: '85vh' },
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              textAlign: 'center',
              maxWidth: '800px',
              mx: 'auto',
            }}
          >
            {/* Icon */}
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: { xs: 64, sm: 80 },
                height: { xs: 64, sm: 80 },
                borderRadius: '20px',
                bgcolor: 'primary.main',
                mb: { xs: 3, sm: 4 },
              }}
            >
              <TravelExplore sx={{ fontSize: { xs: 36, sm: 48 }, color: 'white' }} />
            </Box>

            {/* Title */}
            <Typography
              variant="h1"
              component="h1"
              sx={{
                fontWeight: 700,
                color: 'text.primary',
                mb: 2,
                fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
              }}
            >
              輕鬆管理旅行支出
            </Typography>

            <Typography
              variant="h5"
              sx={{
                color: 'text.secondary',
                mb: { xs: 4, sm: 6 },
                fontWeight: 400,
                fontSize: { xs: '1rem', sm: '1.25rem' },
                px: { xs: 2, sm: 0 },
              }}
            >
              智慧計算分帳，讓每趟旅程都更簡單
            </Typography>

            {/* CTA Buttons */}
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                justifyContent: 'center',
                flexDirection: { xs: 'column', sm: 'row' },
                mb: { xs: 6, sm: 8 },
                px: { xs: 2, sm: 0 },
              }}
            >
              <Button
                onClick={() => router.push('/login')}
                variant="contained"
                size="large"
                endIcon={<ArrowForward />}
                sx={{
                  px: { xs: 4, sm: 5 },
                  py: { xs: 1.5, sm: 1.75 },
                  fontSize: { xs: '1rem', sm: '1.1rem' },
                  fontWeight: 600,
                }}
              >
                開始使用
              </Button>
              <Button
                onClick={() => router.push('/trips')}
                variant="outlined"
                size="large"
                sx={{
                  px: { xs: 4, sm: 5 },
                  py: { xs: 1.5, sm: 1.75 },
                  fontSize: { xs: '1rem', sm: '1.1rem' },
                  fontWeight: 600,
                }}
              >
                查看旅行
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: { xs: 6, sm: 8 }, bgcolor: '#fafafa' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h3"
            sx={{
              textAlign: 'center',
              mb: { xs: 4, sm: 6 },
              fontWeight: 700,
              fontSize: { xs: '1.75rem', sm: '2rem' },
            }}
          >
            核心功能
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gap: { xs: 3, sm: 4 },
              px: { xs: 2, sm: 0 },
            }}
          >
            <Card
              sx={{
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: '12px',
                    bgcolor: 'primary.main',
                    mb: 2,
                  }}
                >
                  <Add sx={{ fontSize: 28, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={600} gutterBottom sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                  輕鬆記帳
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                  快速記錄每筆支出，隨時隨地更新
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: '12px',
                    bgcolor: 'primary.main',
                    mb: 2,
                  }}
                >
                  <Calculate sx={{ fontSize: 28, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={600} gutterBottom sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                  智能分帳
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                  自動計算每個人應付的金額
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: '12px',
                    bgcolor: 'primary.main',
                    mb: 2,
                  }}
                >
                  <Payments sx={{ fontSize: 28, color: 'white' }} />
                </Box>
                <Typography variant="h6" fontWeight={600} gutterBottom sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                  一鍵結算
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                  最優化的轉帳方案，省時又便利
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
