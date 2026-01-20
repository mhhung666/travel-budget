'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
} from '@mui/material';
import { GroupAdd, Info, People } from '@mui/icons-material';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  hash_code: string;
  created_at: string;
  member_count: number;
}

export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const hashCode = params.hashCode as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    checkAuthAndLoadTrip();
  }, []);

  const checkAuthAndLoadTrip = async () => {
    try {
      // 檢查是否登入
      const authRes = await fetch('/api/auth/me');
      if (!authRes.ok) {
        // 未登入，導向登入頁並記住要加入的旅行
        router.push(`/login?redirect=/join/${hashCode}`);
        return;
      }

      // 載入旅行資訊
      const tripRes = await fetch(`/api/trips/${hashCode}`);
      if (!tripRes.ok) {
        if (tripRes.status === 404) {
          setError('找不到此旅行，請確認 ID 是否正確');
        } else if (tripRes.status === 403) {
          // 已經是成員，直接導向旅行頁面
          setAlreadyMember(true);
          setTimeout(() => router.push(`/trips/${hashCode}`), 2000);
        } else {
          setError('無法載入旅行資訊');
        }
      } else {
        const data = await tripRes.json();
        setTrip(data.trip);
      }
    } catch (err) {
      setError('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setIsJoining(true);
    setError('');

    try {
      const response = await fetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: hashCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      // 成功加入，導向旅行頁面
      router.push(`/trips/${hashCode}`);
    } catch (err: any) {
      setError(err.message);
      setIsJoining(false);
    }
  };

  if (loading) {
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
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (alreadyMember) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Card elevation={3}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              您已經是此旅行的成員了！正在導向旅行頁面...
            </Alert>
            <CircularProgress />
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (error && !trip) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Card elevation={3}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
            <Button variant="contained" onClick={() => router.push('/trips')}>
              返回旅行列表
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 8 }}>
      <Container maxWidth="sm">
        <Card elevation={3}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Avatar
              sx={{
                width: 80,
                height: 80,
                bgcolor: 'primary.main',
                margin: '0 auto 24px',
                fontSize: '2rem',
              }}
            >
              <GroupAdd fontSize="large" />
            </Avatar>

            <Typography variant="h4" gutterBottom fontWeight={600}>
              加入旅行
            </Typography>

            {trip && (
              <>
                <Card
                  variant="outlined"
                  sx={{
                    mt: 3,
                    mb: 3,
                    textAlign: 'left',
                    bgcolor: 'primary.50',
                    borderColor: 'primary.200',
                  }}
                >
                  <CardContent>
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                      {trip.name}
                    </Typography>
                    {trip.description && (
                      <Typography variant="body1" color="text.secondary" paragraph>
                        {trip.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                      <Chip
                        icon={<People />}
                        label={`${trip.member_count} 位成員`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        icon={<Info />}
                        label={`ID: ${trip.hash_code}`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </CardContent>
                </Card>

                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={handleJoin}
                  disabled={isJoining}
                  startIcon={isJoining ? <CircularProgress size={20} /> : <GroupAdd />}
                  sx={{ py: 1.5, fontWeight: 600 }}
                >
                  {isJoining ? '加入中...' : '加入此旅行'}
                </Button>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 2, display: 'block' }}
                >
                  加入後，您可以查看和新增支出記錄
                </Typography>
              </>
            )}
          </CardContent>
        </Card>

        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button variant="text" onClick={() => router.push('/trips')}>
            返回旅行列表
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
