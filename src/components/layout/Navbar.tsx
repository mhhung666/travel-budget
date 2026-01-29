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
import { LogOut, Compass, Settings, BarChart3 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/app/[locale]/context/ThemeContext';
import { MoonIcon, SunIcon } from './ThemeIcons';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslations } from 'next-intl';
import { logout } from '@/actions';

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
      await logout();
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

  const handleStats = () => {
    router.push('/stats');
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
        <Toolbar sx={{ px: { xs: 0 }, justifyContent: 'space-between', position: 'relative' }}>
          {/* 左側：Logo 和標題 */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                color: 'text.primary',
                fontWeight: 600,
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                cursor: 'pointer'
              }}
              onClick={() => router.push('/')}
            >
              {displayTitle}
            </Typography>
          </Box>

          {/* 中間：導航按鈕 */}
          {showUserMenu && user && (
            <Box sx={{
              display: 'flex',
              gap: { xs: 0, md: 1 },
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)'
            }}>
              {/* 桌面版：帶文字按鈕 */}
              <Button
                onClick={handleTrips}
                startIcon={<Compass size={20} />}
                sx={{ color: 'text.primary', textTransform: 'none', display: { xs: 'none', md: 'inline-flex' } }}
              >
                {t('trips')}
              </Button>
              <Button
                onClick={handleStats}
                startIcon={<BarChart3 size={20} />}
                sx={{ color: 'text.primary', textTransform: 'none', display: { xs: 'none', md: 'inline-flex' } }}
              >
                {t('stats')}
              </Button>
              {/* 手機版：僅圖標 */}
              <IconButton onClick={handleTrips} sx={{ color: 'text.primary', display: { xs: 'flex', md: 'none' } }}>
                <Compass size={24} />
              </IconButton>
              <IconButton onClick={handleStats} sx={{ color: 'text.primary', display: { xs: 'flex', md: 'none' } }}>
                <BarChart3 size={24} />
              </IconButton>
            </Box>
          )}

          {/* 右側：功能區 */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* 語言切換 */}
            <LanguageSwitcher />

            {/* 主題切換按鈕 */}
            <IconButton
              onClick={toggleTheme}
              color="inherit"
              sx={{ ml: 0.5, color: 'text.primary' }}
              aria-label="切換主題"
            >
              {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
            </IconButton>

            {showUserMenu && user ? (
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>

                <Typography
                  variant="body2"
                  sx={{
                    display: { xs: 'none', sm: 'block' },
                    color: 'text.secondary',
                    ml: 2,
                    mr: 1
                  }}
                >
                  {user.display_name || user.username}
                </Typography>
                <IconButton size="large" onClick={handleMenu} color="default" sx={{ p: 0.5 }}>
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
                  <MenuItem onClick={handleSettings}>
                    <Settings size={18} style={{ marginRight: 8 }} />
                    {t('settings')}
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>
                    <LogOut size={18} style={{ marginRight: 8 }} />
                    {t('logout')}
                  </MenuItem>
                </Menu>
              </Box>
            ) : null}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
