'use client';

import { Card, CardContent, Box, Typography, IconButton, Chip } from '@mui/material';
import { Edit2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
import MarkdownRenderer from './MarkdownRenderer';

interface ItineraryDayCardProps {
  day: ItineraryDay;
  isAdmin: boolean;
  onEdit: (day: ItineraryDay) => void;
  onDelete: (dayId: number) => void;
}

export default function ItineraryDayCard({ day, isAdmin, onEdit, onDelete }: ItineraryDayCardProps) {
  const tItinerary = useTranslations('itinerary');

  return (
    <Card elevation={2}>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              label={`Day ${day.day_number}`}
              color="primary"
              size="small"
              sx={{ fontWeight: 600 }}
            />
            <Typography variant="h6" fontWeight={600}>
              {day.title}
            </Typography>
          </Box>
          {isAdmin && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={() => onEdit(day)} title={tItinerary('editDay')}>
                <Edit2 size={16} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => onDelete(day.id)}
                color="error"
                title={tItinerary('deleteDay')}
              >
                <Trash2 size={16} />
              </IconButton>
            </Box>
          )}
        </Box>

        {/* Markdown Content */}
        {day.content ? (
          <MarkdownRenderer content={day.content} />
        ) : (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            {tItinerary('dayContentPlaceholder')}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
