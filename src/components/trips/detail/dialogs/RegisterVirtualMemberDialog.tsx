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

interface RegisterVirtualMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSwitchToLink: () => void;
  virtualMember: Member | null;
  tripId: string;
}

export default function RegisterVirtualMemberDialog({
  open,
  onClose,
  onSwitchToLink,
  virtualMember,
  tripId,
}: RegisterVirtualMemberDialogProps) {
  const t = useTranslations('member.convertVirtual');
  const tAuth = useTranslations('auth.register');
  const tCommon = useTranslations('common');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    setUsername('');
    setDisplayName(virtualMember?.display_name || '');
    setEmail('');
    setPassword('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!virtualMember) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/public/trips/${tripId}/convert-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          virtualUserId: virtualMember.id,
          username: username.trim(),
          display_name: displayName.trim(),
          email: email.trim(),
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
      <DialogTitle>{t('registerTitle')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('registerDescription', { name: virtualMember?.display_name || '' })}
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
            label={tAuth('displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
          />

          <TextField
            label={tAuth('email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            required
            helperText={tAuth('emailHelp')}
            sx={{ mb: 2 }}
          />

          <TextField
            label={tAuth('password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            required
            helperText={tAuth('passwordHelp')}
            sx={{ mb: 2 }}
          />

          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('hasAccount')}{' '}
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={onSwitchToLink}
                sx={{ cursor: 'pointer' }}
              >
                {t('linkExisting')}
              </Link>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? tCommon('loading') : tAuth('registerButton')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
