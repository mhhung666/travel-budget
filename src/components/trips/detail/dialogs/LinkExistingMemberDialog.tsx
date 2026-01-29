'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  Link,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import type { Member } from '@/types';

interface LinkExistingMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSwitchToRegister: () => void;
  virtualMember: Member | null;
  tripId: string;
}

export default function LinkExistingMemberDialog({
  open,
  onClose,
  onSwitchToRegister,
  virtualMember,
  tripId,
}: LinkExistingMemberDialogProps) {
  const t = useTranslations('member.convertVirtual');
  const tAuth = useTranslations('auth.login');
  const tCommon = useTranslations('common');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    setUsername('');
    setPassword('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!virtualMember) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/public/trips/${tripId}/link-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          virtualUserId: virtualMember.id,
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t('error'));
        return;
      }

      // 成功，刷新頁面
      window.location.reload();
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEnter: handleOpen }}
    >
      <DialogTitle>{t('linkTitle')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('linkDescription', { name: virtualMember?.display_name || '' })}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            label={tAuth('username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            autoFocus
          />

          <TextField
            label={tAuth('password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
          />

          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('noAccount')}{' '}
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={onSwitchToRegister}
                sx={{ cursor: 'pointer' }}
              >
                {t('registerNew')}
              </Link>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? tCommon('loading') : t('linkButton')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
