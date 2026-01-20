'use client';

import { Card, CardContent, CardActionArea, Typography, Box, Chip, IconButton } from '@mui/material';
import { ContentCopy, Group, CalendarToday } from '@mui/icons-material';
import type { TripWithMembers } from '@/services/trip.service';

export interface TripCardProps {
  trip: TripWithMembers;
  onClick?: () => void;
  onCopyCode?: (hashCode: string) => void;
}

/**
 * Trip card component for the trips list
 *
 * @example
 * <TripCard
 *   trip={trip}
 *   onClick={() => router.push(`/trips/${trip.hash_code}`)}
 *   onCopyCode={(code) => navigator.clipboard.writeText(code)}
 * />
 */
export function TripCard({ trip, onClick, onCopyCode }: TripCardProps) {
  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyCode?.(trip.hash_code);
  };

  return (
    <Card elevation={2}>
      <CardActionArea onClick={onClick} disabled={!onClick}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {trip.name}
              </Typography>
              {trip.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {trip.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  icon={<Group />}
                  label={`${trip.member_count} members`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  icon={<CalendarToday />}
                  label={new Date(trip.created_at).toLocaleDateString()}
                  size="small"
                  variant="outlined"
                />
                {trip.role === 'admin' && (
                  <Chip label="Admin" size="small" color="primary" variant="filled" />
                )}
              </Box>
            </Box>
            {onCopyCode && (
              <IconButton
                size="small"
                onClick={handleCopyClick}
                sx={{ ml: 1 }}
                title="Copy trip code"
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
