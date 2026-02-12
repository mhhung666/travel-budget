'use client';

import { useEffect, useState } from 'react';
import { Plus, UserPlus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCurrentUser, getTrips } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import type { TripWithMembers } from '@/types';
import Navbar from '@/components/layout/Navbar';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import JoinTripDialog from '@/components/trips/JoinTripDialog';
import TripList from '@/components/trips/TripList';
import EmptyTripsState from '@/components/trips/EmptyTripsState';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function TripsPage() {
  const t = useTranslations('trips');
  const tNav = useTranslations('nav');
  const { toast } = useToast();

  const [user, setUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [trips, setTrips] = useState<TripWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

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
      const shareUrl = `${window.location.origin}/join/${hashCode}`;
      await navigator.clipboard.writeText(shareUrl);
      toast({
        description: t('idCopied'),
        className: "bg-green-500 text-white border-green-600",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        description: t('copyFailed'),
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

      <div className="container mx-auto px-4 pt-24 pb-8 max-w-6xl">
        <Card className="border-none shadow-none bg-transparent sm:bg-card sm:border sm:shadow-sm">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-0 sm:px-6">
            <CardTitle className="text-2xl font-bold">
              {t('list')}
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                onClick={() => setShowJoinModal(true)}
                variant="outline"
                className="gap-2"
              >
                <UserPlus size={16} />
                {t('joinTrip')}
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="gap-2"
              >
                <Plus size={16} />
                {t('createTrip')}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="px-0 sm:px-6">
            {trips.length === 0 ? (
              <EmptyTripsState />
            ) : (
              <TripList trips={trips} onCopyCode={copyHashCode} />
            )}
          </CardContent>
        </Card>
      </div>

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
          toast({
            description: t('join.success'),
            className: "bg-green-500 text-white border-green-600",
          });
          loadTrips();
        }}
      />
    </div>
  );
}
