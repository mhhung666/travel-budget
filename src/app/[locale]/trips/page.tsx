'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Snackbar,
  Chip,
} from '@mui/material';
import { Plus, UserPlus, Users, Calendar, Copy, MapPin, CalendarRange } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { useTranslations, useLocale } from 'next-intl';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import type { TripWithMembers } from '@/types';

export default function TripsPage() {
  const router = useRouter();
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<TripWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [joinTripId, setJoinTripId] = useState('');
  const [error, setError] = useState('');
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
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
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
      const response = await fetch('/api/trips');
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips);
      }
    } catch (error) {
      console.error('Load trips error:', error);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const requestBody = {
        ...formData,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        location: selectedLocation || null,
      };

      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowCreateModal(false);
      setFormData({ name: '', description: '', start_date: '', end_date: '' });
      setSelectedLocation(null);
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoinTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: joinTripId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowJoinModal(false);
      setJoinTripId('');
      setSnackbar({ open: true, message: t('join.success'), severity: 'success' });
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyHashCode = async (hashCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  {t('noTrips')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('noTripsDescription')}
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                  gap: 2,
                }}
              >
                {trips.map((trip) => (
                  <Card
                    key={trip.id}
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: 4,
                        transform: 'translateY(-4px)',
                      },
                    }}
                  >
                    <CardActionArea onClick={() => router.push(`/trips/${trip.hash_code}`)}>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          {trip.name}
                        </Typography>
                        {trip.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {trip.description}
                          </Typography>
                        )}

                        {/* 地點顯示 */}
                        {trip.location && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                            <Box component="span" sx={{ color: 'action.active', display: 'flex' }}>
                              <MapPin size={16} />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {trip.location.name}
                              {trip.location.country && `, ${trip.location.country}`}
                            </Typography>
                          </Box>
                        )}

                        {/* 日期顯示 */}
                        {(trip.start_date || trip.end_date) && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                            <Box component="span" sx={{ color: 'action.active', display: 'flex' }}>
                              <CalendarRange size={16} />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {trip.start_date
                                ? new Date(trip.start_date).toLocaleDateString(
                                  locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                                )
                                : ''}
                              {trip.start_date && trip.end_date && ' ~ '}
                              {trip.end_date
                                ? new Date(trip.end_date).toLocaleDateString(
                                  locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                                )
                                : ''}
                            </Typography>
                          </Box>
                        )}

                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                            mb: 1,
                          }}
                        >
                          <Chip
                            icon={<Users size={16} />}
                            label={`${trip.member_count} ${t('members')}`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            icon={<Calendar size={16} />}
                            label={new Date(trip.created_at).toLocaleDateString(
                              locale === 'zh' ? 'zh-TW' : 'en-US'
                            )}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                        <Chip
                          label={`${t('idLabel')} ${trip.hash_code}`}
                          size="small"
                          onClick={(e) => copyHashCode(trip.hash_code, e)}
                          icon={<Copy size={16} />}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'primary.50' },
                          }}
                        />
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Container>

      {/* Create Trip Dialog */}
      <Dialog
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setError('');
          setFormData({ name: '', description: '', start_date: '', end_date: '' });
          setSelectedLocation(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('create.title')}</DialogTitle>
        <form onSubmit={handleCreateTrip}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              label={t('create.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label={t('create.description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={3}
              sx={{ mb: 2 }}
            />

            {/* 旅遊地點 */}
            <LocationAutocomplete
              value={selectedLocation}
              onChange={setSelectedLocation}
              label={t('create.location')}
              placeholder={t('create.locationPlaceholder')}
              helperText={t('create.locationHelp')}
            />

            {/* 旅遊時間區間 */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <TextField
                fullWidth
                label={t('create.startDate')}
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
              <TextField
                fullWidth
                label={t('create.endDate')}
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: formData.start_date || undefined },
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setShowCreateModal(false);
                setError('');
                setFormData({ name: '', description: '', start_date: '', end_date: '' });
                setSelectedLocation(null);
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" variant="contained">
              {tCommon('create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Join Trip Dialog */}
      <Dialog
        open={showJoinModal}
        onClose={() => {
          setShowJoinModal(false);
          setError('');
          setJoinTripId('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('join.title')}</DialogTitle>
        <form onSubmit={handleJoinTrip}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              label={t('join.tripId')}
              value={joinTripId}
              onChange={(e) => setJoinTripId(e.target.value)}
              required
              placeholder={t('join.tripIdPlaceholder')}
              helperText={t('join.tripIdHelp')}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setShowJoinModal(false);
                setError('');
                setJoinTripId('');
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" variant="contained">
              {t('join.joinButton')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

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
