'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
  Typography,
} from '@mui/material';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Trip, Member } from '@/types';
import {
  TripMembers,
  TripShare,
  TripDangerZone,
  AddVirtualMemberDialog,
  DeleteTripDialog,
  RemoveMemberDialog,
  RegisterVirtualMemberDialog,
  LinkExistingMemberDialog,
} from '@/components/trips';
import {
  getCurrentUser,
  getTrip,
  getMembers,
  deleteTrip,
  addVirtualMember,
  removeMember,
} from '@/actions';

export default function TripSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations();
  const tMember = useTranslations('member');
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tError = useTranslations('error');
  const tAction = useTranslations('action');

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [addVirtualMemberDialog, setAddVirtualMemberDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean;
    member: Member | null;
  }>({ open: false, member: null });

  // Virtual member convert dialogs
  const [registerVirtualDialog, setRegisterVirtualDialog] = useState(false);
  const [linkVirtualDialog, setLinkVirtualDialog] = useState(false);
  const [selectedVirtualMember, setSelectedVirtualMember] = useState<Member | null>(null);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(true);

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
    try {
      // Try to check authentication (not required for viewing)
      let user = null;
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        user = userResult.data;
        setCurrentUser(user);
      }

      // If logged in, use Server Actions
      if (user) {
        const [tripResult, membersResult] = await Promise.all([
          getTrip(tripId),
          getMembers(tripId),
        ]);

        if (!tripResult.success) {
          // If not a member, try public API
          if (tripResult.code === 'FORBIDDEN') {
            await loadPublicData();
            return;
          }
          setError(tError('loadTripFailed'));
          return;
        }

        setTrip(tripResult.data);
        setMembers(membersResult.success ? membersResult.data : []);
      } else {
        // Not logged in, use public API
        await loadPublicData();
      }
    } catch (err) {
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadPublicData = async () => {
    const [tripResponse, membersResponse] = await Promise.all([
      fetch(`/api/public/trips/${tripId}`),
      fetch(`/api/public/trips/${tripId}/members`),
    ]);

    if (!tripResponse.ok) {
      setError(tError('loadTripFailed'));
      return;
    }

    const tripData = await tripResponse.json();
    const membersData = await membersResponse.json();

    setTrip(tripData.trip || null);
    setMembers(membersData.members || []);
  };

  const copyHashCode = async () => {
    try {
      const shareUrl = `${window.location.origin}/join/${trip?.hash_code || ''}`;
      await navigator.clipboard.writeText(shareUrl);
      setSnackbar({ open: true, message: tAction('copySuccess'), severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: tAction('copyFailed'), severity: 'error' });
    }
  };

  const handleDeleteTrip = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTrip(tripId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tTrip('deleted'), severity: 'success' });
      setTimeout(() => router.push('/trips'), 1000);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberDialog.member) return;
    try {
      const result = await removeMember(tripId, removeMemberDialog.member.id);

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tMember('success.removed'), severity: 'success' });
      setRemoveMemberDialog({ open: false, member: null });
      await loadData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleAddVirtualMember = async (name: string) => {
    try {
      const result = await addVirtualMember(tripId, {
        display_name: name.trim(),
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setSnackbar({ open: true, message: tMember('virtualMemberAdded'), severity: 'success' });
      setAddVirtualMemberDialog(false);
      await loadData();
    } catch (err: any) {
      throw err;
    }
  };

  const isCurrentUserMember = currentUser && members.some((m) => m.id === currentUser.id);
  const isCurrentUserAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

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
            {tTrips('detail.backToTrip')}
          </Button>
        </Box>
      </Box>
    );
  }

  if (!trip) return null;

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
        title={`${tTrip('settings')}`}
      />

      <Container maxWidth="md" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        {/* 返回按钮 */}
        <Button
          startIcon={<ArrowLeft />}
          onClick={() => router.push(`/trips/${tripId}`)}
          sx={{
            mb: 3,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
            },
          }}
        >
          {tTrips('detail.backToTrip')}
        </Button>

        <Typography variant="h4" fontWeight={700} gutterBottom>
          {tTrip('settings')}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
          {/* 成员管理 */}
          <TripMembers
            members={members}
            currentUser={currentUser}
            isCurrentUserAdmin={!!isCurrentUserAdmin}
            onAddVirtualMember={() => setAddVirtualMemberDialog(true)}
            onRemoveMember={(member) => setRemoveMemberDialog({ open: true, member })}
            onVirtualMemberClick={(member) => {
              setSelectedVirtualMember(member);
              setRegisterVirtualDialog(true);
            }}
            expanded={membersExpanded}
            onToggleExpand={() => setMembersExpanded(!membersExpanded)}
          />

          {/* 分享功能 */}
          <TripShare
            tripHashCode={trip.hash_code}
            onCopy={copyHashCode}
          />

          {/* 危险操作区 */}
          {isCurrentUserAdmin && (
            <TripDangerZone onDelete={() => setDeleteDialogOpen(true)} />
          )}
        </Box>
      </Container>

      {/* Dialogs */}
      <AddVirtualMemberDialog
        open={addVirtualMemberDialog}
        onClose={() => setAddVirtualMemberDialog(false)}
        onSubmit={handleAddVirtualMember}
      />

      <DeleteTripDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteTrip}
        tripName={trip.name}
        isDeleting={isDeleting}
      />

      <RemoveMemberDialog
        open={removeMemberDialog.open}
        onClose={() => setRemoveMemberDialog({ open: false, member: null })}
        onConfirm={handleRemoveMember}
        member={removeMemberDialog.member}
      />

      <RegisterVirtualMemberDialog
        open={registerVirtualDialog}
        onClose={() => {
          setRegisterVirtualDialog(false);
          setSelectedVirtualMember(null);
        }}
        onSwitchToLink={() => {
          setRegisterVirtualDialog(false);
          setLinkVirtualDialog(true);
        }}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
      />

      <LinkExistingMemberDialog
        open={linkVirtualDialog}
        onClose={() => {
          setLinkVirtualDialog(false);
          setSelectedVirtualMember(null);
        }}
        onSwitchToRegister={() => {
          setLinkVirtualDialog(false);
          setRegisterVirtualDialog(true);
        }}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
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
