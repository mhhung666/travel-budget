'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { joinTrip } from '@/actions';

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
    onSuccess: () => void;
}

export default function JoinTripDialog({ open, onClose, onSuccess }: JoinTripDialogProps) {
    const t = useTranslations('trips');
    const tCommon = useTranslations('common');

    const [joinTripId, setJoinTripId] = useState('');
    const [error, setError] = useState('');

    const handleClose = () => {
        setError('');
        setJoinTripId('');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const result = await joinTrip(joinTripId);

            if (!result.success) {
                throw new Error(result.error);
            }

            handleClose();
            onSuccess();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(tCommon('error.unknown'));
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('join.title')}</DialogTitle>
                    <DialogDescription>
                        Enter the unique Trip ID or Hash Code to join an existing trip.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
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
                        <p className="text-sm text-muted-foreground">
                            {t('join.tripIdHelp')}
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            {tCommon('cancel')}
                        </Button>
                        <Button type="submit">
                            {t('join.joinButton')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
