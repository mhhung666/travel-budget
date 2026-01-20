'use client';

import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Container,
} from '@mui/material';
import { Logout, TravelExplore, Settings } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/app/[locale]/context/ThemeContext';
import { MoonIcon, SunIcon } from './ThemeIcons';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslations } from 'next-intl';

interface NavbarProps {
  user?: {
    id: number;
    username: string;
    email: string;
    display_name?: string;
  } | null;
  showUserMenu?: boolean;
  title?: string;
}

export default function Navbar({ user, showUserMenu = true, title }: NavbarProps) {
  const router = useRouter();
  const t = useTranslations('nav');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { mode, toggleTheme } = useThemeContext();
  const displayTitle = title || t('home');

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('登出失敗:', error);
    }
  };

  const handleTrips = () => {
    router.push('/trips');
    handleClose();
  };

  const handleSettings = () => {
    router.push('/settings');
    handleClose();
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar sx={{ px: { xs: 0 } }}>
          <TravelExplore sx={{ mr: 1, color: 'primary.main' }} />
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              color: 'text.primary',
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' },
            }}
          >
            {displayTitle}
          </Typography>

          {/* 語言切換 */}
          <LanguageSwitcher />

          {/* 主題切換按鈕 */}
          <IconButton
            onClick={toggleTheme}
            color="inherit"
            sx={{ mr: 1, color: 'text.primary' }}
            aria-label="切換主題"
          >
            {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>

          {showUserMenu && user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  color: 'text.secondary',
                }}
              >
                {user.display_name || user.username}
              </Typography>
              <IconButton size="large" onClick={handleMenu} color="default">
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    fontSize: '0.875rem',
                  }}
                >
                  {(user.display_name || user.username).charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
              >
                <MenuItem onClick={handleTrips}>
                  <TravelExplore sx={{ mr: 1 }} fontSize="small" />
                  {t('trips')}
                </MenuItem>
                <MenuItem onClick={handleSettings}>
                  <Settings sx={{ mr: 1 }} fontSize="small" />
                  {t('settings')}
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <Logout sx={{ mr: 1 }} fontSize="small" />
                  {t('logout')}
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Button
              variant="contained"
              onClick={() => router.push('/login')}
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                px: { xs: 2, sm: 3 },
                fontSize: { xs: '0.875rem', sm: '1rem' },
              }}
            >
              {t('login')}
            </Button>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
}
