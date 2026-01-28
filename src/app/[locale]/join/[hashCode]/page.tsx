'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
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
import { UserPlus, Info, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';
import { getCurrentUser, getTrip, joinTrip } from '@/actions';

export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const hashCode = params.hashCode as string;
  const t = useTranslations('trips');
  const tError = useTranslations('error');

  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    checkAuthAndLoadTrip();
  }, []);

  const checkAuthAndLoadTrip = async () => {
    try {
      const authResult = await getCurrentUser();
      if (!authResult.success || !authResult.data) {
        router.push(`/login?redirect=/join/${hashCode}`);
        return;
      }

      const tripResult = await getTrip(hashCode);
      if (!tripResult.success) {
        if (tripResult.code === 'NOT_FOUND') {
          setError(t('quickJoin.notFound'));
        } else if (tripResult.code === 'FORBIDDEN') {
          // 已經是成員，直接跳轉
          setAlreadyMember(true);
          setTimeout(() => router.push(`/trips/${hashCode}`), 2000);
        } else {
          setError(t('quickJoin.loadError'));
        }
      } else {
        setTrip({
          ...tripResult.data,
          member_count: 0, // 會在 getTrip 中沒有返回，使用預設值
        } as TripWithMembers);
      }
    } catch (err) {
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setIsJoining(true);
    setError('');

    try {
      const result = await joinTrip(hashCode);

      if (!result.success) {
        throw new Error(result.error);
      }

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
              {t('quickJoin.alreadyMember')}
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
              {t('detail.backToTrips')}
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
              <UserPlus size={40} />
            </Avatar>

            <Typography variant="h4" gutterBottom fontWeight={600}>
              {t('join.title')}
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
                        icon={<Users size={18} />}
                        label={`${trip.member_count} ${t('members')}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        icon={<Info size={18} />}
                        label={`${t('idLabel')} ${trip.hash_code}`}
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
                  startIcon={isJoining ? <CircularProgress size={20} /> : <UserPlus />}
                  sx={{ py: 1.5, fontWeight: 600 }}
                >
                  {isJoining ? t('quickJoin.joining') : t('quickJoin.joinThisTrip')}
                </Button>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 2, display: 'block' }}
                >
                  {t('quickJoin.joinHint')}
                </Typography>
              </>
            )}
          </CardContent>
        </Card>

        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button variant="text" onClick={() => router.push('/trips')}>
            {t('detail.backToTrips')}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
