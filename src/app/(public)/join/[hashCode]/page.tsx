'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/navigation';
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Eye,
  Info,
  Loader2,
  LogIn,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { joinTrip } from '@/actions';
import { clearTripAccessModes } from '@/hooks/queries/fetcher';
import { tripKeys, useCurrentUser, useMembers, useTrip } from '@/hooks/queries';
import { ROUTES } from '@/constants/routes';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import TripDestination from '@/components/trips/TripDestination';

/**
 * 公開邀請確認頁。登入與成員查詢可以延後完成，但旅程摘要必須先解析成功，
 * 才能顯示加入動作。登入／註冊會透過 redirect 回到同一張邀請。
 */
export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const hashCode = params.hashCode as string;
  const locale = useLocale();
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');

  const { data: currentUser, isPending: userPending } = useCurrentUser();
  const {
    data: trip,
    isPending: tripPending,
    isError: tripIsError,
    error: tripError,
  } = useTrip(hashCode);
  const { data: members = [], isPending: membersPending } = useMembers(hashCode);

  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const isLoggedIn = !!currentUser;
  const alreadyMember = isLoggedIn && members.some((member) => member.id === currentUser.id);
  const inviter = members.find((member) => member.role === 'admin');
  const dateLocale = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale;

  useEffect(() => {
    if (!alreadyMember || !trip) return;
    const timer = setTimeout(() => router.push(ROUTES.TRIP_DETAIL(trip.id)), 1200);
    return () => clearTimeout(timer);
  }, [alreadyMember, trip, router]);

  const handleJoin = async () => {
    if (!trip) return;
    setIsJoining(true);
    setError('');

    try {
      const result = await joinTrip(hashCode);
      if (result.success || result.code === 'CONFLICT') clearTripAccessModes();

      if (!result.success) {
        if (result.code === 'CONFLICT') {
          router.push(ROUTES.TRIP_DETAIL(trip.id));
          return;
        }
        setError(result.code === 'NOT_FOUND' ? t('quickJoin.notFound') : t('join.error'));
        setIsJoining(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: tripKeys.all(hashCode) });
      await queryClient.invalidateQueries({ queryKey: tripKeys.all(result.data.id) });
      await queryClient.invalidateQueries({ queryKey: tripKeys.list });
      router.push(ROUTES.TRIP_DETAIL(result.data.id));
    } catch {
      setError(t('join.error'));
      setIsJoining(false);
    }
  };

  const handleLoginToJoin = () => {
    router.push(`/?redirect=${encodeURIComponent(ROUTES.JOIN(hashCode))}`);
  };

  // PersistQueryClientProvider 還原 IndexedDB 時，query 是 pending + idle；
  // isLoading 會是 false，因此這裡必須用 isPending 避免閃出錯誤畫面。
  if (tripPending || userPending) {
    return <JoinPageSkeleton />;
  }

  if (tripIsError || !trip) {
    const message = tripError?.message.includes('404')
      ? t('quickJoin.notFound')
      : t('quickJoin.loadError');

    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg items-center px-4 py-10">
        <section className="w-full border-y py-10 text-center sm:border sm:p-10">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Info className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">{tCommon('errorTitle')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
          <Button variant="outline" className="mt-7 w-full" onClick={() => router.push('/trips')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('detail.backToTrips')}
          </Button>
        </section>
      </main>
    );
  }

  if (alreadyMember) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg items-center px-4 py-10">
        <section className="w-full text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="mt-3 text-muted-foreground">{t('quickJoin.alreadyMember')}</p>
          <Loader2 className="mx-auto mt-7 h-6 w-6 animate-spin text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">{t('quickJoin.redirecting')}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:py-16">
      <section className="min-w-0">
        <div className="mb-7 flex items-center gap-3 text-sm font-medium text-primary">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-4 w-4" />
          </span>
          {t('join.title')}
        </div>

        <h1 className="break-words text-3xl font-semibold leading-tight sm:text-4xl">
          {trip.name}
        </h1>
        {trip.description && (
          <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-muted-foreground">
            {trip.description}
          </p>
        )}

        <div className="mt-8 grid gap-4 border-y py-6 sm:grid-cols-2">
          <TripDestination
            destination={trip.destination_location}
            iconSize={18}
            className="text-base text-foreground"
          />

          {(trip.start_date || trip.end_date) && (
            <div className="flex items-center gap-2.5 text-sm text-foreground">
              <CalendarRange className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <span>
                {trip.start_date ? new Date(trip.start_date).toLocaleDateString(dateLocale) : ''}
                {trip.start_date && trip.end_date && ' – '}
                {trip.end_date ? new Date(trip.end_date).toLocaleDateString(dateLocale) : ''}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2.5 text-sm">
            <Users className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            {membersPending ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <span>
                {members.length} {t('members')}
              </span>
            )}
          </div>
        </div>

        {inviter && (
          <div className="mt-6 flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={inviter.avatar_url ?? undefined} alt="" />
              <AvatarFallback>
                {(inviter.display_name || inviter.username).slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {t('quickJoin.invitedBy', {
                  name: inviter.display_name || inviter.username,
                })}
              </p>
              <Badge variant="secondary" className="mt-1">
                {t('quickJoin.organizer')}
              </Badge>
            </div>
          </div>
        )}
      </section>

      <aside className="border-t pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
        <h2 className="text-lg font-semibold">
          {isLoggedIn ? t('quickJoin.readyTitle') : t('quickJoin.loginTitle')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isLoggedIn ? t('quickJoin.joinHint') : t('quickJoin.loginHint')}
        </p>

        <div className="mt-5 flex items-start gap-2.5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>{t('quickJoin.invitePrivacy')}</span>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-5">
            <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-7 space-y-3">
          {isLoggedIn ? (
            <Button size="lg" className="h-12 w-full" onClick={handleJoin} disabled={isJoining}>
              {isJoining ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-5 w-5" />
              )}
              {isJoining ? t('quickJoin.joining') : t('quickJoin.joinThisTrip')}
            </Button>
          ) : (
            <Button size="lg" className="h-12 w-full" onClick={handleLoginToJoin}>
              <LogIn className="mr-2 h-5 w-5" />
              {t('quickJoin.loginToJoin')}
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => router.push(isLoggedIn ? '/trips' : ROUTES.TRIP_DETAIL(hashCode))}
          >
            {isLoggedIn ? <ArrowLeft className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {isLoggedIn ? t('detail.backToTrips') : t('quickJoin.viewAsGuest')}
          </Button>
        </div>
      </aside>
    </main>
  );
}

function JoinPageSkeleton() {
  return (
    <main
      className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16"
      aria-busy="true"
      aria-label="Loading"
    >
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-7 h-11 w-3/4" />
        <Skeleton className="mt-4 h-5 w-full max-w-xl" />
        <Skeleton className="mt-2 h-5 w-2/3" />
        <div className="mt-8 grid gap-4 border-y py-6 sm:grid-cols-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <div className="border-t pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-4/5" />
        <Skeleton className="mt-8 h-12 w-full" />
      </div>
    </main>
  );
}
