'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { createTrip } from '@/actions';

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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CreateTripDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTripDialog({ open, onClose, onSuccess }: CreateTripDialogProps) {
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [error, setError] = useState('');

  const handleClose = () => {
    setError('');
    setFormData({ name: '', description: '', start_date: '', end_date: '' });
    setSelectedLocation(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const result = await createTrip({
        ...formData,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        location: selectedLocation || null,
      });

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>Fill in the details to create a new trip budget.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t('create.name')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('create.description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* 旅遊地點 */}
          <div className="space-y-2">
            {/* LocationAutocomplete handles its own Label if passed, but for consistency let's pass it a label prop */}
            <LocationAutocomplete
              value={selectedLocation}
              onChange={setSelectedLocation}
              label={t('create.location')}
              placeholder={t('create.locationPlaceholder')}
              helperText={t('create.locationHelp')}
            />
          </div>

          {/* 旅遊時間區間 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">{t('create.startDate')}</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{t('create.endDate')}</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit">{tCommon('create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
