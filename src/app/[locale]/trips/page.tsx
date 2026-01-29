'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import { Plus, UserPlus } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { useTranslations } from 'next-intl';
import { getCurrentUser, getTrips } from '@/actions';
import type { TripWithMembers } from '@/types';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import JoinTripDialog from '@/components/trips/JoinTripDialog';
import TripList from '@/components/trips/TripList';
import EmptyTripsState from '@/components/trips/EmptyTripsState';

export default function TripsPage() {
  const t = useTranslations('trips');
  const tNav = useTranslations('nav');
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<TripWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  useEffect(() => {
    loadUserAndTrips();
  }, []);

  const loadUserAndTrips = async () => {
    try {
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        setUser(userResult.data);
      }
      await loadTrips();
    } catch (error) {
      console.error('Load user error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrips = async () => {
    try {
      const result = await getTrips();
      if (result.success) {
        setTrips(result.data);
      }
    } catch (error) {
      console.error('Load trips error:', error);
    }
  };

  const copyHashCode = async (hashCode: string) => {
    try {
      await navigator.clipboard.writeText(hashCode);
      setSnackbar({ open: true, message: t('idCopied'), severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: t('copyFailed'), severity: 'error' });
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar
        user={
          user
            ? {
              id: user.id,
              username: user.display_name,
              email: user.email,
            }
            : null
        }
        showUserMenu={true}
        title={tNav('trips')}
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        <Card elevation={2}>
          <CardContent sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 2,
                mb: 3,
              }}
            >
              <Typography variant="h5" fontWeight={600}>
                {t('list')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                <Button
                  onClick={() => setShowJoinModal(true)}
                  variant="outlined"
                  startIcon={<UserPlus />}
                  sx={{ textTransform: 'none' }}
                >
                  {t('joinTrip')}
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="contained"
                  startIcon={<Plus />}
                  sx={{ textTransform: 'none' }}
                >
                  {t('createTrip')}
                </Button>
              </Box>
            </Box>

            {trips.length === 0 ? (
              <EmptyTripsState />
            ) : (
              <TripList trips={trips} onCopyCode={copyHashCode} />
            )}
          </CardContent>
        </Card>
      </Container>

      {/* Create Trip Dialog */}
      <CreateTripDialog
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={loadTrips}
      />

      {/* Join Trip Dialog */}
      <JoinTripDialog
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onSuccess={() => {
          setSnackbar({ open: true, message: t('join.success'), severity: 'success' });
          loadTrips();
        }}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
