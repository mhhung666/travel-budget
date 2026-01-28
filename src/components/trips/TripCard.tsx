'use client';

import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import { Copy, Users, Calendar, MapPin, CalendarRange } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { TripWithMembers } from '@/types';

export interface TripCardProps {
  trip: TripWithMembers;
  onClick: () => void;
  onCopyCode: (code: string) => void;
}

export default function TripCard({ trip, onClick, onCopyCode }: TripCardProps) {
  const t = useTranslations('trips');
  const locale = useLocale();

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyCode(trip.hash_code);
  };

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        transition: 'all 0.3s',
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-4px)',
        },
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          textAlign: 'left'
        }}
      >
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {trip.name}
          </Typography>
          {trip.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {trip.description}
            </Typography>
          )}

          {/* Location */}
          {trip.location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <Box component="span" sx={{ color: 'action.active', display: 'flex' }}>
                <MapPin size={16} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {trip.location.name}
                {trip.location.country && `, ${trip.location.country}`}
              </Typography>
            </Box>
          )}

          {/* Dates */}
          {(trip.start_date || trip.end_date) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <Box component="span" sx={{ color: 'action.active', display: 'flex' }}>
                <CalendarRange size={16} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {trip.start_date
                  ? new Date(trip.start_date).toLocaleDateString(
                    locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                  )
                  : ''}
                {trip.start_date && trip.end_date && ' ~ '}
                {trip.end_date
                  ? new Date(trip.end_date).toLocaleDateString(
                    locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
                  )
                  : ''}
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              mb: 1,
            }}
          >
            <Chip
              icon={<Users size={16} />}
              label={`${trip.member_count} ${t('members')}`}
              size="small"
              variant="outlined"
            />

          </Box>
          <Chip
            label={`${t('idLabel')} ${trip.hash_code}`}
            size="small"
            onClick={handleCopyClick}
            icon={<Copy size={16} />}
            sx={{
              cursor: 'pointer',
              '&:hover': { bgcolor: 'primary.50' },
            }}
          />
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
