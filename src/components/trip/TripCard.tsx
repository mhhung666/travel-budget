'use client';

import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
  Chip,
  IconButton,
} from '@mui/material';
import { Copy, Users, Calendar } from 'lucide-react';
import type { TripWithMembers } from '@/types';

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
                  icon={<Users size={16} />}
                  label={`${trip.member_count} members`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  icon={<Calendar size={16} />}
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
                <Copy size={20} />
              </IconButton>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
