'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Eye, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
import MarkdownRenderer from './MarkdownRenderer';

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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {mode === 'add' ? tItinerary('addDay') : tItinerary('editDay')}
        </DialogTitle>
        <DialogContent>
          <TextField
            label={tItinerary('dayTitle')}
            placeholder={tItinerary('dayTitlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            sx={{ mt: 1, mb: 2 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, val) => val && setViewMode(val)}
              size="small"
            >
              <ToggleButton value="write">
                <Pencil size={14} />
                <Box component="span" sx={{ ml: 0.5 }}>{tItinerary('write')}</Box>
              </ToggleButton>
              <ToggleButton value="preview">
                <Eye size={14} />
                <Box component="span" sx={{ ml: 0.5 }}>{tItinerary('preview')}</Box>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {viewMode === 'write' ? (
            <TextField
              label={tItinerary('dayContent')}
              placeholder={tItinerary('dayContentPlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              multiline
              minRows={8}
              maxRows={20}
            />
          ) : (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                minHeight: 200,
                bgcolor: 'background.paper',
              }}
            >
              {content ? (
                <MarkdownRenderer content={content} />
              ) : (
                <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                  {tItinerary('dayContentPlaceholder')}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={loading || !title.trim()}>
            {loading ? tCommon('loading') : tCommon('save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
