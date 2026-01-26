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
import { GroupAdd, Info, People } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('trips');
  const tError = useTranslations('error');

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
      const authRes = await fetch('/api/auth/me');
      if (!authRes.ok) {
        router.push(`/login?redirect=/join/${hashCode}`);
        return;
      }

      const tripRes = await fetch(`/api/trips/${hashCode}`);
      if (!tripRes.ok) {
        if (tripRes.status === 404) {
          setError(t('quickJoin.notFound'));
        } else if (tripRes.status === 403) {
          setAlreadyMember(true);
          setTimeout(() => router.push(`/trips/${hashCode}`), 2000);
        } else {
          setError(t('quickJoin.loadError'));
        }
      } else {
        const data = await tripRes.json();
        setTrip(data.trip);
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
      const response = await fetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: hashCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
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
              <GroupAdd fontSize="large" />
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
                        icon={<People />}
                        label={`${trip.member_count} ${t('members')}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        icon={<Info />}
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
                  startIcon={isJoining ? <CircularProgress size={20} /> : <GroupAdd />}
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
