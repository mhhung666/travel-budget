'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Loader2 } from 'lucide-react';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { createTrip, addFriendsToTrip } from '@/actions';
import { useFriends } from '@/hooks/queries';
import type { Trip } from '@/types';

import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { trackProductEvent } from '@/lib/productEvents';

interface CreateTripDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (trip: Trip) => void;
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
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 建立當下即可挑好友一起加入（ROADMAP #12 Phase 3）。好友資料共用 useFriends 快取。
  // 進階欄位展開前不先請求好友，讓第一屏只專注在唯一必填的旅行名稱。
  const { data: friendsData } = useFriends(open && detailsOpen);
  const friends = friendsData?.friends ?? [];

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = () => {
    setError('');
    setFormData({ name: '', description: '', start_date: '', end_date: '' });
    setDepartureLocation(null);
    setDestinationLocation(null);
    setSelectedFriends(new Set());
    setDetailsOpen(false);
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

      const createdTrip = result.data;
      trackProductEvent('activation_step', { step: 'trip_created' });

      // 建立成功後，把勾選的好友直接加入新旅程（best-effort：即使失敗旅程仍已建立，
      // 使用者可事後在成員頁補加，故不因此擋下流程）。
      if (selectedFriends.size > 0) {
        const addResult = await addFriendsToTrip(createdTrip.id, {
          friend_ids: [...selectedFriends],
        });
        if (addResult.success) {
          trackProductEvent('activation_step', { step: 'companion_added' });
        }
      }

      handleClose();
      onSuccess(createdTrip);
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

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between px-2 text-muted-foreground"
            >
              <span>{t('create.moreDetails')}</span>
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
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

            {/* 從好友挑選一起加入（有好友時才顯示） */}
            {friends.length > 0 && (
              <div className="space-y-2">
                <Label>{t('create.inviteFriends')}</Label>
                <ScrollArea className="max-h-40 rounded-md border">
                  <div className="space-y-1 p-2">
                    {friends.map((f) => (
                      <label
                        key={f.user.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedFriends.has(f.user.id)}
                          onCheckedChange={() => toggleFriend(f.user.id)}
                        />
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={f.user.avatar_url ?? ''} alt={f.user.display_name} />
                          <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                            {f.user.display_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {f.user.display_name}
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </form>
    </ResponsiveFormSheet>
  );
}
