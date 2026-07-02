'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { createTrip } from '@/actions';

import { ResponsiveFormSheet } from '@/components/common';
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

const FORM_ID = 'create-trip-form';

export default function CreateTripDialog({ open, onClose, onSuccess }: CreateTripDialogProps) {
  const t = useTranslations('trips');
  const tCommon = useTranslations('common');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [departureLocation, setDepartureLocation] = useState<LocationOption | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<LocationOption | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setError('');
    setFormData({ name: '', description: '', start_date: '', end_date: '' });
    setDepartureLocation(null);
    setDestinationLocation(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const result = await createTrip({
        ...formData,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        departure_location: departureLocation || null,
        destination_location: destinationLocation || null,
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(val) => !val && handleClose()}
      title={t('create.title')}
      description={t('create.formDescription')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} className="max-md:hidden">
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={submitting}
            className="max-md:h-12 max-md:w-full max-md:text-base"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon('create')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">{t('create.name')}</Label>
          <Input
            id="name"
            value={formData.name}
            placeholder={t('create.namePlaceholder')}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('create.description')}</Label>
          <Textarea
            id="description"
            value={formData.description}
            placeholder={t('create.descriptionPlaceholder')}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>

        {/* 出發地 / 目的地 —— 手機空間不足以並排放下地名，改為直排 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <LocationAutocomplete
              value={departureLocation}
              onChange={setDepartureLocation}
              label={t('create.departure')}
              placeholder={t('create.departurePlaceholder')}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <LocationAutocomplete
              value={destinationLocation}
              onChange={setDestinationLocation}
              label={t('create.destination')}
              placeholder={t('create.destinationPlaceholder')}
            />
          </div>
        </div>

        {/* 旅遊時間區間 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="start_date">{t('create.startDate')}</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>
          <div className="min-w-0 space-y-2">
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
      </form>
    </ResponsiveFormSheet>
  );
}
