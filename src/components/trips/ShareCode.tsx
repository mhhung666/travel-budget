'use client';

import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  Snackbar,
  Alert,
} from '@mui/material';
import { Copy } from 'lucide-react';

export interface ShareCodeProps {
  hashCode: string;
  title?: string;
  description?: string;
}

/**
 * Share code component for inviting others to join a trip
 *
 * @example
 * <ShareCode
 *   hashCode={trip.hash_code}
 *   title="Share this trip"
 *   description="Share this code with friends to let them join"
 * />
 */
export function ShareCode({
  hashCode,
  title = 'Share Code',
  description = 'Share this code to let others join',
}: ShareCodeProps) {
  const [copied, setCopied] = useState(false);

  const getShareUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/join/${hashCode}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
      <Card variant="outlined" sx={{ bgcolor: 'primary.50', borderColor: 'primary.200' }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom fontWeight={600}>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              value={getShareUrl()}
              size="small"
              slotProps={{ input: { readOnly: true } }}
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" startIcon={<Copy size={20} />} onClick={handleCopy}>
              Copy
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {description}
          </Typography>
        </CardContent>
      </Card>

      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)}>
        <Alert severity="success" onClose={() => setCopied(false)}>
          Code copied!
        </Alert>
      </Snackbar>
    </>
  );
}
