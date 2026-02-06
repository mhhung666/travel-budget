'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import {
  RegisterVirtualMemberDialog,
  LinkExistingMemberDialog,
} from '@/components/trips';
import { getCurrentUser, getTrip, getMembers } from '@/actions';
import type { Trip, Member } from '@/types';

export default function LinkVirtualMemberPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.tripId as string;
  const username = params.username as string;

  const t = useTranslations('member.convertVirtual');
  const tError = useTranslations('error');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [virtualMember, setVirtualMember] = useState<Member | null>(null);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, [tripId, username]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Get current user (if logged in)
      const userResult = await getCurrentUser();
      if (userResult.success && userResult.data) {
        setCurrentUser(userResult.data);
      }

      // Use public API to get trip and virtual member info
      const response = await fetch(`/api/public/link-virtual/${tripId}/${username}`);

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 404) {
          setError(t('notFound'));
        } else if (response.status === 400 && errorData.error === 'Member is not virtual') {
          setError(t('alreadyLinked'));
        } else {
          setError(tError('loadFailed'));
        }
        return;
      }

      const data = await response.json();
      setTrip(data.trip);
      setVirtualMember({
        id: data.member.id,
        username: data.member.username,
        display_name: data.member.display_name,
        is_virtual: data.member.is_virtual,
        joined_at: '',
        role: 'member',
      });

      // Check if user is already a member of this trip
      if (userResult.success && userResult.data) {
        const userId = userResult.data.id;

        // Try to get members - if it succeeds, check if user is in the list
        // If it fails (FORBIDDEN), user is not a member
        const membersResult = await getMembers(tripId);
        if (membersResult.success) {
          const isAlreadyMember = membersResult.data.some(
            (m) => m.id === userId
          );
          if (isAlreadyMember) {
            setError(t('alreadyMember'));
            return;
          }
        }

        // If getMembers failed or user not in list, show link dialog
        // User is logged in but not a member - show link dialog
        setShowLinkDialog(true);
      } else {
        // User is not logged in - show register dialog
        setShowRegisterDialog(true);
      }
    } catch (err) {
      console.error('Load error:', err);
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClose = () => {
    setShowRegisterDialog(false);
    setShowLinkDialog(false);
    router.push('/');
  };

  const handleSwitchToLink = () => {
    setShowRegisterDialog(false);
    setShowLinkDialog(true);
  };

  const handleSwitchToRegister = () => {
    setShowLinkDialog(false);
    setShowRegisterDialog(true);
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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Navbar user={null} showUserMenu={false} />
        <Container maxWidth="sm" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
              <Button
                variant="contained"
                onClick={() => router.push('/')}
                size="large"
              >
                {tError('goBack')}
              </Button>
            </CardContent>
          </Card>
        </Container>
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
        showUserMenu={!!currentUser}
      />
      <Container maxWidth="sm" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        <Card>
          <CardContent sx={{ py: 4 }}>
            <Typography variant="h5" fontWeight={600} gutterBottom align="center">
              {t('inviteTitle', { tripName: trip?.name || '' })}
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 2 }}>
              {t('inviteDescription', { memberName: virtualMember?.display_name || '' })}
            </Typography>
          </CardContent>
        </Card>
      </Container>

      {/* Dialogs */}
      <RegisterVirtualMemberDialog
        open={showRegisterDialog}
        onClose={handleDialogClose}
        onSwitchToLink={handleSwitchToLink}
        virtualMember={virtualMember}
        tripId={tripId}
      />

      <LinkExistingMemberDialog
        open={showLinkDialog}
        onClose={handleDialogClose}
        onSwitchToRegister={handleSwitchToRegister}
        virtualMember={virtualMember}
        tripId={tripId}
      />
    </Box>
  );
}
