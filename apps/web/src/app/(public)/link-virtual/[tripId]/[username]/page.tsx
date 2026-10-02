'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  RegisterVirtualMemberDialog,
  LinkExistingMemberDialog,
} from '@/components/trips/detail/dialogs';
import { getCurrentUser, getMembers } from '@/actions';
import type { Member } from '@/types';
import { InviteCard, ErrorView } from '@/components/link-virtual';
import type { VirtualInviteTrip } from '@/components/link-virtual/InviteCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/constants/routes';
import { useRouter } from '@/i18n/navigation';
import { logger } from '@/lib/logger';

type InviteResponse = {
  trip: VirtualInviteTrip;
  member: Pick<Member, 'id' | 'username' | 'display_name' | 'is_virtual'>;
};

export default function LinkVirtualMemberPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const tripId = params.tripId as string;
  const username = params.username as string;

  const t = useTranslations('member.convertVirtual');
  const tError = useTranslations('error');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState<VirtualInviteTrip | null>(null);
  const [virtualMember, setVirtualMember] = useState<Member | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError('');

      try {
        // These requests are independent. Running them together avoids making a public
        // invitation wait for session lookup before its trip summary can load.
        const [userResult, response] = await Promise.all([
          getCurrentUser(),
          fetch(
            `/api/public/link-virtual/${encodeURIComponent(tripId)}/${encodeURIComponent(username)}`
          ),
        ]);

        if (cancelled) return;

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.status === 404) {
            setError(t('notFound'));
          } else if (response.status === 400 && errorData.error === 'NOT_VIRTUAL') {
            setError(t('alreadyLinked'));
          } else {
            setError(tError('loadFailed'));
          }
          return;
        }

        const data = (await response.json()) as InviteResponse;
        if (cancelled) return;

        setTrip(data.trip);
        setVirtualMember({
          ...data.member,
          joined_at: '',
          role: 'member',
        });

        if (userResult.success && userResult.data) {
          setIsLoggedIn(true);
          const userId = userResult.data.id;
          const membersResult = await getMembers(tripId);
          if (
            !cancelled &&
            membersResult.success &&
            membersResult.data.some((existingMember) => existingMember.id === userId)
          ) {
            setError(t('alreadyMember'));
          }
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('Load virtual member invitation error', err);
        setError(tError('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
    // Translation functions only format response states; they must not restart network loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, username]);

  const handleClaimSuccess = () => {
    if (!trip) return;
    // The claim can replace the active account. Drop persisted viewer/trip data before routing.
    queryClient.clear();
    router.replace(ROUTES.TRIP_DETAIL(trip.hash_code));
  };

  const handleDialogClose = () => {
    setShowRegisterDialog(false);
    setShowLinkDialog(false);
  };

  const handleSwitchToLink = () => {
    setShowRegisterDialog(false);
    setShowLinkDialog(true);
  };

  const handleSwitchToRegister = () => {
    setShowLinkDialog(false);
    setShowRegisterDialog(true);
  };

  if (loading) return <VirtualInviteSkeleton />;

  if (error) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg items-center px-4 py-10">
        <ErrorView
          error={error}
          onBack={() => router.push(trip ? ROUTES.TRIP_DETAIL(trip.hash_code) : '/')}
        />
      </main>
    );
  }

  if (!trip || !virtualMember) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg items-center px-4 py-10">
        <ErrorView error={tError('loadFailed')} onBack={() => router.push('/')} />
      </main>
    );
  }

  return (
    <>
      <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:py-16">
        <InviteCard trip={trip} virtualMember={virtualMember} />

        <aside className="border-t pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <h2 className="text-lg font-semibold">{t('claimTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('claimHint', { memberName: virtualMember.display_name })}
          </p>

          <div className="mt-5 flex items-start gap-2.5 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{t('claimPrivacy')}</span>
          </div>

          <div className="mt-7 space-y-3">
            <Button
              size="lg"
              className="h-12 w-full"
              onClick={() => (isLoggedIn ? setShowLinkDialog(true) : setShowRegisterDialog(true))}
            >
              {isLoggedIn ? (
                <LogIn className="mr-2 h-5 w-5" />
              ) : (
                <UserPlus className="mr-2 h-5 w-5" />
              )}
              {isLoggedIn ? t('linkExisting') : t('registerNew')}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full"
              onClick={() => (isLoggedIn ? setShowRegisterDialog(true) : setShowLinkDialog(true))}
            >
              {isLoggedIn ? t('registerNew') : t('linkExisting')}
            </Button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => router.push(ROUTES.TRIP_DETAIL(trip.hash_code))}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('viewTrip')}
            </Button>
          </div>
        </aside>
      </main>

      <RegisterVirtualMemberDialog
        open={showRegisterDialog}
        onClose={handleDialogClose}
        onSwitchToLink={handleSwitchToLink}
        onSuccess={handleClaimSuccess}
        virtualMember={virtualMember}
        tripId={tripId}
      />

      <LinkExistingMemberDialog
        open={showLinkDialog}
        onClose={handleDialogClose}
        onSwitchToRegister={handleSwitchToRegister}
        onSuccess={handleClaimSuccess}
        virtualMember={virtualMember}
        tripId={tripId}
      />
    </>
  );
}

function VirtualInviteSkeleton() {
  return (
    <main
      className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16"
      aria-busy="true"
      aria-label="Loading"
    >
      <div>
        <Skeleton className="h-9 w-36" />
        <Skeleton className="mt-7 h-11 w-3/4" />
        <Skeleton className="mt-4 h-5 w-full max-w-xl" />
        <div className="mt-8 border-y py-6">
          <Skeleton className="h-14 w-56" />
        </div>
      </div>
      <div className="border-t pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-4/5" />
        <Skeleton className="mt-8 h-12 w-full" />
        <Skeleton className="mt-3 h-12 w-full" />
      </div>
    </main>
  );
}
