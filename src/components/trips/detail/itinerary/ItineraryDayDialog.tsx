'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, Pencil, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import MarkdownRenderer from './MarkdownRenderer';

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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ItineraryDayDialogProps {
  mode: 'add' | 'edit';
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    content: string;
    location: LocationOption | null;
  }) => Promise<void>;
  day?: ItineraryDay | null;
  dayNumber?: number;
}

export default function ItineraryDayDialog({
  mode,
  open,
  onClose,
  onSubmit,
  day,
  dayNumber,
}: ItineraryDayDialogProps) {
  const tItinerary = useTranslations('itinerary');
  const tCommon = useTranslations('common');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [location, setLocation] = useState<LocationOption | null>(null);
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && day) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入當日資料，為刻意的同步
        setTitle(day.title);
        setContent(day.content);
        setLocation(
          day.location
            ? {
                name: day.location.name,
                names: day.location.names,
                display_name: day.location.display_name,
                lat: day.location.lat,
                lon: day.location.lon,
                country: day.location.country,
                country_code: day.location.country_code,
              }
            : null
        );
      } else {
        setTitle('');
        setContent('');
        setLocation(null);
      }
      setViewMode('write');
      requestAnimationFrame(autoResize);
    }
  }, [open, mode, day, autoResize]);

  useEffect(() => {
    if (viewMode === 'write') {
      requestAnimationFrame(autoResize);
    }
  }, [viewMode, autoResize]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onSubmit({ title: title.trim(), content, location });
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add'
              ? dayNumber
                ? tItinerary('addDayN', { dayNumber })
                : tItinerary('addDay')
              : dayNumber
                ? tItinerary('editDayN', { dayNumber })
                : tItinerary('editDay')}
          </DialogTitle>
        </DialogHeader>

        <form
          id="itinerary-day-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto p-1"
        >
          <div className="space-y-2">
            <Label htmlFor="day-title">{tItinerary('dayTitle')}</Label>
            <Input
              id="day-title"
              placeholder={tItinerary('dayTitlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              label={tItinerary('dayLocation')}
              placeholder={tItinerary('dayLocationPlaceholder')}
              helperText={tItinerary('dayLocationHelp')}
            />
          </div>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'write' | 'preview')}>
            <div className="flex justify-end mb-2">
              <TabsList className="grid w-[200px] grid-cols-2">
                <TabsTrigger value="write" className="gap-2">
                  <Pencil size={14} />
                  {tItinerary('write')}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye size={14} />
                  {tItinerary('preview')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="write" className="m-0 border rounded-md">
              <Textarea
                ref={textareaRef}
                className="min-h-[200px] w-full resize-none border-0 focus-visible:ring-0 rounded-md p-4"
                placeholder={tItinerary('dayContentPlaceholder')}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  autoResize();
                }}
              />
            </TabsContent>
            <TabsContent
              value="preview"
              className="m-0 border rounded-md p-4 min-h-[200px] bg-muted/20"
            >
              {content ? (
                <MarkdownRenderer content={content} />
              ) : (
                <div className="min-h-[200px] flex items-center justify-center text-muted-foreground italic">
                  {tItinerary('dayContentPlaceholder')}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </form>

        <Separator />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form="itinerary-day-form" disabled={loading || !title.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
