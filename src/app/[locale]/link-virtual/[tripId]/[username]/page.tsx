'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import {
  RegisterVirtualMemberDialog,
  LinkExistingMemberDialog,
} from '@/components/trips/detail/dialogs';
import { getCurrentUser, getMembers } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import type { Trip, Member } from '@/types';
import { InviteCard, ErrorView } from '@/components/link-virtual';

export default function LinkVirtualMemberPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.tripId as string;
  const username = params.username as string;

  const t = useTranslations('member.convertVirtual');
  const tError = useTranslations('error');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [virtualMember, setVirtualMember] = useState<Member | null>(null);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const loadData = useCallback(async () => {
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
          const isAlreadyMember = membersResult.data.some((m) => m.id === userId);
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
  }, [tripId, username, t, tError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時載入資料，為刻意的初始化副作用
    loadData();
  }, [loadData]);

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar user={null} showUserMenu={false} />
        <div className="container mx-auto px-4 max-w-sm pt-20 sm:pt-28 pb-8">
          <ErrorView error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
      <div className="container mx-auto px-4 max-w-sm pt-20 sm:pt-28 pb-8">
        <InviteCard trip={trip} virtualMember={virtualMember} />
      </div>

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
    </div>
  );
}
