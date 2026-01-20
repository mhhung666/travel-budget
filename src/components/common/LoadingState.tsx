'use client';

import { Box, CircularProgress, Typography } from '@mui/material';

export interface LoadingStateProps {
  message?: string;
  size?: number;
  fullScreen?: boolean;
}

/**
 * Loading state component
 *
 * @example
 * // Simple loading
 * if (loading) return <LoadingState />;
 *
 * // With message
 * if (loading) return <LoadingState message="Loading trips..." />;
 *
 * // Full screen
 * if (loading) return <LoadingState fullScreen />;
 */
export function LoadingState({ message, size = 60, fullScreen = false }: LoadingStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        ...(fullScreen && {
          minHeight: '100vh',
        }),
        ...(!fullScreen && {
          py: 8,
        }),
      }}
    >
      <CircularProgress size={size} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
}
