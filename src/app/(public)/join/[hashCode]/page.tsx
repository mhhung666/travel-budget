'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/navigation';
import { UserPlus, Info, Users, Loader2, ArrowLeft, LogIn, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { joinTrip } from '@/actions';
import { tripKeys, useCurrentUser, useTrip, useMembers } from '@/hooks/queries';
import { ROUTES } from '@/constants/routes';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

/**
 * 加入行程頁。未登入也能看到行程預覽（useTrip/useMembers 內建公開 API 回退），
 * 「加入」需要帳號 → 導向首頁登入表單並帶 ?redirect= 回到本頁；
 * 也可選擇以訪客身分唯讀檢視（/trips/[hash_code] 本就支援未登入）。
 */
export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const hashCode = params.hashCode as string;
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');

  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(hashCode);
  const { data: members = [], isLoading: membersLoading } = useMembers(hashCode);

  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const loading = userLoading || tripLoading || membersLoading;
  const isLoggedIn = !!currentUser;
  const alreadyMember = isLoggedIn && members.some((m) => m.id === currentUser.id);

  // 已是成員 → 短暫提示後導向行程頁
  useEffect(() => {
    if (!alreadyMember || !trip) return;
    const timer = setTimeout(() => router.push(ROUTES.TRIP_DETAIL(trip.id)), 2000);
    return () => clearTimeout(timer);
  }, [alreadyMember, trip, router]);

  const handleJoin = async () => {
    if (!trip) return;
    setIsJoining(true);
    setError('');

    try {
      const result = await joinTrip(hashCode);

      if (!result.success) {
        throw new Error(result.error);
      }

      // 讓以 hash_code 為鍵的公開快取（成員/行程）失效，避免加入後仍顯示訪客資料
      await queryClient.invalidateQueries({ queryKey: tripKeys.all(hashCode) });
      router.push(ROUTES.TRIP_DETAIL(trip.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsJoining(false);
    }
  };

  const handleLoginToJoin = () => {
    router.push(`/?redirect=${encodeURIComponent(ROUTES.JOIN(hashCode))}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Already a member view
  if (alreadyMember) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Alert variant="info">
              <Info className="h-4 w-4" />
              <AlertTitle>{tCommon('infoTitle')}</AlertTitle>
              <AlertDescription>{t('quickJoin.alreadyMember')}</AlertDescription>
            </Alert>
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('quickJoin.redirecting')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error view (Trip not found or other errors)
  if (!trip) {
    const message = tripError?.message.includes('404')
      ? t('quickJoin.notFound')
      : t('quickJoin.loadError');
    return (
      <div className="flex min-h-[60vh] flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full border-destructive/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <Info className="h-5 w-5" />
                {tCommon('errorTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => router.push('/trips')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('detail.backToTrips')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Main Join UI
  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4 py-10">
        <Card className="max-w-md w-full shadow-lg border-primary/10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center">
              <UserPlus className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('join.title')}</CardTitle>
            <CardDescription>
              {isLoggedIn ? t('quickJoin.joinHint') : t('quickJoin.loginHint')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            <div className="bg-muted/30 rounded-lg p-6 border border-border space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{trip.name}</h3>
                {trip.description && (
                  <p className="text-muted-foreground text-sm">{trip.description}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1 px-2 py-1">
                  <Users className="h-3 w-3" />
                  {members.length} {t('members')}
                </Badge>
                <Badge variant="secondary" className="gap-1 px-2 py-1 font-mono">
                  #{trip.hash_code}
                </Badge>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoggedIn ? (
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full font-semibold text-lg h-12"
                  onClick={handleJoin}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t('quickJoin.joining')}
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-5 w-5" />
                      {t('quickJoin.joinThisTrip')}
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => router.push('/trips')}
                >
                  {t('detail.backToTrips')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full font-semibold text-lg h-12"
                  onClick={handleLoginToJoin}
                >
                  <LogIn className="mr-2 h-5 w-5" />
                  {t('quickJoin.loginToJoin')}
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => router.push(ROUTES.TRIP_DETAIL(hashCode))}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t('quickJoin.viewAsGuest')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
