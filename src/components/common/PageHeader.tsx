'use client';

import { Box, Typography, Button, IconButton } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backButton?: boolean;
  backButtonLabel?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

/**
 * Page header component with optional back button and actions
 *
 * @example
 * <PageHeader
 *   title="Trip Details"
 *   subtitle="Manage your trip expenses"
 *   backButton
 *   onBack={() => router.push('/trips')}
 *   actions={
 *     <Button variant="contained" startIcon={<Add />}>
 *       Add Expense
 *     </Button>
 *   }
 * />
 */
export function PageHeader({
  title,
  subtitle,
  backButton,
  backButtonLabel = 'Back',
  onBack,
  actions,
}: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {backButton && onBack && (
        <Button
          startIcon={<ArrowBack />}
          onClick={onBack}
          sx={{
            mb: 2,
            textTransform: 'none',
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
            },
          }}
        >
          {backButtonLabel}
        </Button>
      )}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom={!!subtitle}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body1" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
