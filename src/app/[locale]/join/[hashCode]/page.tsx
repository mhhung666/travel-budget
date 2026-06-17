'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { UserPlus, Info, Users, Loader2, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';
import { getCurrentUser, getTripPreview, joinTrip } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import Navbar from '@/components/layout/Navbar';

export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const hashCode = params.hashCode as string;
  const t = useTranslations('trips');
  const tError = useTranslations('error');

  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  const checkAuthAndLoadTrip = useCallback(async () => {
    try {
      const authResult = await getCurrentUser();
      if (!authResult.success || !authResult.data) {
        // Redirect to login if not authenticated
        router.push(`/login?redirect=/join/${hashCode}`);
        return;
      }
      
      setCurrentUser(authResult.data);

      const tripResult = await getTripPreview(hashCode);
      if (!tripResult.success) {
        if (tripResult.code === 'NOT_FOUND') {
          setError(t('quickJoin.notFound'));
        } else {
          setError(t('quickJoin.loadError'));
        }
      } else if (tripResult.data.isMember) {
        // Already a member, redirect
        setAlreadyMember(true);
        setTimeout(() => router.push(`/trips/${tripResult.data.id}`), 2000);
      } else {
        setTrip(tripResult.data);
      }
    } catch {
      setError(tError('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [hashCode, router, t, tError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時載入行程資料，為刻意的初始化副作用
    checkAuthAndLoadTrip();
  }, [checkAuthAndLoadTrip]);

  const handleJoin = async () => {
    if (!trip) return;
    setIsJoining(true);
    setError('');

    try {
      const result = await joinTrip(hashCode);

      if (!result.success) {
        throw new Error(result.error);
      }

      router.push(`/trips/${trip.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Already a member view
  if (alreadyMember) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Alert className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertTitle className="text-blue-800 dark:text-blue-300">Info</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-400">
                {t('quickJoin.alreadyMember')}
              </AlertDescription>
            </Alert>
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Redirecting to trip...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error view (Trip not found or other errors)
  if (!trip && error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar user={currentUser} showUserMenu={!!currentUser} />
        <div className="flex-1 flex items-center justify-center p-4">
            <Card className="max-w-md w-full border-destructive/20 shadow-lg">
            <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                <Info className="h-5 w-5" />
                Error
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => router.push('/trips')}
                >
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar user={currentUser} showUserMenu={!!currentUser} />
      
      <div className="flex-1 flex flex-col items-center justify-center p-4 pt-20">
        <Card className="max-w-md w-full shadow-lg border-primary/10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center">
                <UserPlus className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('join.title')}</CardTitle>
            <CardDescription>{t('quickJoin.joinHint')}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {trip && (
              <>
                <div className="bg-muted/30 rounded-lg p-6 border border-border space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-1">{trip.name}</h3>
                    {trip.description && (
                      <p className="text-muted-foreground text-sm">{trip.description}</p>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1 px-2 py-1">
                      <Users className="h-3 w-3" />
                      {trip.member_count || 0} {t('members')}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 px-2 py-1 font-mono">
                      #{trip.hash_code}
                    </Badge>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
