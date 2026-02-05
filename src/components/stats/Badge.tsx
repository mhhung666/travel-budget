'use client';

import { Box, Typography } from '@mui/material';

interface BadgeProps {
  count: number;
  label: string;
}

export default function Badge({ count, label }: BadgeProps) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5,
      bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 2
    }}>
      <Typography variant="body2" fontWeight={700} color="primary.main">{count}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
