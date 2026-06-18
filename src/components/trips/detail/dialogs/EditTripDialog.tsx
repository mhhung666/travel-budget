'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { Trip } from '@/types';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface EditTripFormData {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  departure_location: LocationOption | null;
  destination_location: LocationOption | null;
}

interface EditTripDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: EditTripFormData) => Promise<void>;
  trip: Trip | null;
}

export default function EditTripDialog({ open, onClose, onSubmit, trip }: EditTripDialogProps) {
  const tTrip = useTranslations('trip');
  const tCommon = useTranslations('common');
  const tTrips = useTranslations('trips');

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [departureLocation, setDepartureLocation] = useState<LocationOption | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<LocationOption | null>(null);

  useEffect(() => {
    if (open && trip) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時用 trip 帶入表單，為刻意的同步
      setForm({
        name: trip.name,
        description: trip.description || '',
        start_date: trip.start_date ? new Date(trip.start_date).toISOString().split('T')[0] : '',
        end_date: trip.end_date ? new Date(trip.end_date).toISOString().split('T')[0] : '',
      });
      const toOption = (loc: Trip['departure_location']): LocationOption | null =>
        loc
          ? {
              name: loc.name,
              names: loc.names,
              display_name: loc.display_name,
              lat: loc.lat,
              lon: loc.lon,
              country: loc.country,
              country_code: loc.country_code,
            }
          : null;
      setDepartureLocation(toOption(trip.departure_location));
      setDestinationLocation(toOption(trip.destination_location));
      setError('');
    }
  }, [open, trip]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    setIsSaving(true);
    setError('');

    try {
      await onSubmit({
        ...form,
        departure_location: departureLocation,
        destination_location: destinationLocation,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{tTrip('editTrip')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{tTrips('create.name')}</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{tTrips('create.description')}</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <LocationAutocomplete
              value={departureLocation}
              onChange={setDepartureLocation}
              label={tTrips('create.departure')}
              placeholder={tTrips('create.departurePlaceholder')}
              helperText={tTrips('create.departureHelp')}
            />
          </div>

          <div className="space-y-2">
            <LocationAutocomplete
              value={destinationLocation}
              onChange={setDestinationLocation}
              label={tTrips('create.destination')}
              placeholder={tTrips('create.destinationPlaceholder')}
              helperText={tTrips('create.destinationHelp')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">{tTrips('create.startDate')}</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{tTrips('create.endDate')}</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                min={form.start_date}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !form.name.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tTrip('saveEdit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
