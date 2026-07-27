'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { joinTrip } from '@/actions';
import type { Trip } from '@/types';
import { parseTripInviteInput } from '@/lib/tripInvite';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface JoinTripDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (trip: Trip) => void;
}

export default function JoinTripDialog({ open, onClose, onSuccess }: JoinTripDialogProps) {
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');

  const [joinTripId, setJoinTripId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleClose = () => {
    setError('');
    setJoinTripId('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = parseTripInviteInput(joinTripId);
    if (!code) {
      setError(t('join.invalidInvite'));
      return;
    }
    setIsJoining(true);

    try {
      const result = await joinTrip(code);

      if (!result.success) {
        throw new Error(result.error);
      }

      const joinedTrip = result.data;
      handleClose();
      onSuccess(joinedTrip);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(tCommon('error.unknown'));
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('join.title')}</DialogTitle>
          <DialogDescription>{t('join.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="tripId">{t('join.tripId')}</Label>
            <Input
              id="tripId"
              value={joinTripId}
              onChange={(e) => setJoinTripId(e.target.value)}
              required
              placeholder={t('join.tripIdPlaceholder')}
            />
            <p className="text-sm text-muted-foreground">{t('join.tripIdHelp')}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isJoining}>
              {isJoining ? t('quickJoin.joining') : t('join.joinButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
