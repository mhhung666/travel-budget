import { Box, Card, CardContent, Typography, Button, Chip } from '@mui/material';
import { Edit2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Trip } from '@/types';

interface TripHeaderProps {
  trip: Trip;
  isCurrentUserAdmin: boolean;
  onEdit: () => void;
}

export default function TripHeader({ trip, isCurrentUserAdmin, onEdit }: TripHeaderProps) {
  const tTrip = useTranslations('trip');
  const tCommon = useTranslations('common');

  return (
    <Card elevation={2} sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            {tTrip('info')}
          </Typography>
          {isCurrentUserAdmin && (
            <Button
              size="small"
              startIcon={<Edit2 size={16} />}
              onClick={onEdit}
            >
              {tCommon('edit')}
            </Button>
          )}
        </Box>
        {trip.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {trip.description}
          </Typography>
        )}

        {/* 地點顯示 */}
        {trip.location && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              📍 {trip.location.name}{trip.location.country && `, ${trip.location.country}`}
            </Typography>
          </Box>
        )}

        {/* 日期顯示 */}
        {(trip.start_date || trip.end_date) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              📅 {trip.start_date ? new Date(trip.start_date).toLocaleDateString() : ''}
              {trip.start_date && trip.end_date && ' ~ '}
              {trip.end_date ? new Date(trip.end_date).toLocaleDateString() : ''}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Chip
            label={`${tTrip('createdAt')} ${new Date(trip.created_at).toLocaleDateString()}`}
            size="small"
          />
        </Box>
      </CardContent>
    </Card>
  );
}
