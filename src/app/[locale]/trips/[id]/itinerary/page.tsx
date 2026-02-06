'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { ArrowLeft, Plus } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { ItineraryDayCard, ItineraryDayDialog } from '@/components/trips/detail/itinerary';
import type { ItineraryDay, Member } from '@/types';
import {
  getCurrentUser,
  getItinerary,
  getMembers,
  createItineraryDay,
  updateItineraryDay,
  deleteItineraryDay,
} from '@/actions';

export default function ItineraryPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tItinerary = useTranslations('itinerary');
  const tError = useTranslations('error');

  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingDay, setEditingDay] = useState<ItineraryDay | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
    try {
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        setCurrentUser(userResult.data);
      }

      const [itineraryResult, membersResult] = await Promise.all([
        getItinerary(tripId),
        getMembers(tripId),
      ]);

      if (!itineraryResult.success) {
        if (itineraryResult.code === 'FORBIDDEN') {
          setError(tError('notMember'));
          return;
        }
        setError(tItinerary('loadFailed'));
        return;
      }

      setDays(itineraryResult.data);
      setMembers(membersResult.success ? membersResult.data : []);
    } catch {
      setError(tItinerary('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddDay = () => {
    setDialogMode('add');
    setEditingDay(null);
    setDialogOpen(true);
  };

  const handleEditDay = (day: ItineraryDay) => {
    setDialogMode('edit');
    setEditingDay(day);
    setDialogOpen(true);
  };

  const handleDeleteDay = async (dayId: number) => {
    if (deleteConfirmId !== dayId) {
      setDeleteConfirmId(dayId);
      return;
    }

    try {
      const result = await deleteItineraryDay(tripId, dayId);
      if (!result.success) throw new Error(result.error);

      setSnackbar({ open: true, message: tItinerary('success.deleted'), severity: 'success' });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleDialogSubmit = async (data: { title: string; content: string }) => {
    if (dialogMode === 'add') {
      const result = await createItineraryDay(tripId, data);
      if (!result.success) throw new Error(result.error);
      setSnackbar({ open: true, message: tItinerary('success.created'), severity: 'success' });
    } else if (editingDay) {
      const result = await updateItineraryDay(tripId, editingDay.id, data);
      if (!result.success) throw new Error(result.error);
      setSnackbar({ open: true, message: tItinerary('success.updated'), severity: 'success' });
    }
    await loadData();
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

  if (error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
          <Button onClick={() => router.push(`/trips/${tripId}`)} variant="contained" size="large">
            {tItinerary('backToTrip')}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar
        user={
          currentUser
            ? {
                id: currentUser.id,
                username: currentUser.display_name,
                email: currentUser.email,
              }
            : null
        }
        showUserMenu={true}
        title={tItinerary('title')}
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        {/* Back button */}
        <Button
          startIcon={<ArrowLeft />}
          onClick={() => router.push(`/trips/${tripId}`)}
          sx={{
            mb: 3,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          {tItinerary('backToTrip')}
        </Button>

        {/* Header with Add button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>
            {tItinerary('title')}
          </Typography>
          {isCurrentUserAdmin && (
            <Button
              variant="contained"
              startIcon={<Plus size={18} />}
              onClick={handleAddDay}
              sx={{ textTransform: 'none' }}
            >
              {tItinerary('addDay')}
            </Button>
          )}
        </Box>

        {/* Day cards */}
        {days.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {tItinerary('emptyState')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tItinerary('emptyStateHint')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {days.map((day) => (
              <ItineraryDayCard
                key={day.id}
                day={day}
                isAdmin={!!isCurrentUserAdmin}
                onEdit={handleEditDay}
                onDelete={handleDeleteDay}
              />
            ))}
          </Box>
        )}
      </Container>

      {/* Add/Edit Dialog */}
      <ItineraryDayDialog
        mode={dialogMode}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        day={editingDay}
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
