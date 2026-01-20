'use client';

import { Box, Alert, Button, Typography } from '@mui/material';
import { Refresh, ArrowBack } from '@mui/icons-material';

export interface ErrorStateProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  onBack?: () => void;
  retryText?: string;
  backText?: string;
  fullScreen?: boolean;
}

/**
 * Error state component
 *
 * @example
 * // Simple error
 * if (error) return <ErrorState message={error} />;
 *
 * // With retry button
 * if (error) return <ErrorState message={error} onRetry={refetch} />;
 *
 * // With back button
 * if (error) return <ErrorState message={error} onBack={() => router.back()} />;
 *
 * // Full screen
 * if (error) return <ErrorState message={error} fullScreen />;
 */
export function ErrorState({
  message,
  title,
  onRetry,
  onBack,
  retryText = 'Retry',
  backText = 'Go Back',
  fullScreen = false,
}: ErrorStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        ...(fullScreen && {
          minHeight: '100vh',
        }),
        ...(!fullScreen && {
          py: 8,
        }),
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: 400 }}>
        {title && (
          <Typography variant="h6" gutterBottom>
            {title}
          </Typography>
        )}
        <Alert severity="error" sx={{ mb: 3 }}>
          {message}
        </Alert>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          {onBack && (
            <Button startIcon={<ArrowBack />} onClick={onBack} variant="outlined">
              {backText}
            </Button>
          )}
          {onRetry && (
            <Button startIcon={<Refresh />} onClick={onRetry} variant="contained">
              {retryText}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
