'use client';

import { useState, useEffect } from 'react';
import { Eye, Pencil, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ItineraryDayDialogProps {
  mode: 'add' | 'edit';
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; content: string }) => Promise<void>;
  day?: ItineraryDay | null;
}

export default function ItineraryDayDialog({
  mode,
  open,
  onClose,
  onSubmit,
  day,
}: ItineraryDayDialogProps) {
  const tItinerary = useTranslations('itinerary');
  const tCommon = useTranslations('common');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && day) {
        setTitle(day.title);
        setContent(day.content);
      } else {
        setTitle('');
        setContent('');
      }
      setViewMode('write');
    }
  }, [open, mode, day]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onSubmit({ title: title.trim(), content });
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
            {mode === 'add' ? tItinerary('addDay') : tItinerary('editDay')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 overflow-y-auto p-1">
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

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'write' | 'preview')} className="flex-1 flex flex-col min-h-0">
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

            <div className="flex-1 min-h-[300px] border rounded-md relative overflow-hidden">
              <TabsContent value="write" className="absolute inset-0 m-0 border-0 p-0 h-full">
                <Textarea
                  className="h-full w-full resize-none border-0 focus-visible:ring-0 rounded-none p-4"
                  placeholder={tItinerary('dayContentPlaceholder')}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="preview" className="absolute inset-0 m-0 border-0 p-4 h-full overflow-y-auto bg-muted/20">
                {content ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic">
                    {tItinerary('dayContentPlaceholder')}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="relative z-10">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
