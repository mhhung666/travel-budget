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
import { LogOut, Compass, Settings, BarChart3, Menu as MenuIcon } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { useThemeContext } from '@/app/[locale]/context/ThemeContext';
import { MoonIcon, SunIcon } from './ThemeIcons';
import LanguageSwitcher from './LanguageSwitcher';
import { useTranslations } from 'next-intl';
import { logout } from '@/actions';

import { Button as ShadcnButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar as ShadcnAvatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

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
  const { mode, toggleTheme } = useThemeContext();
  const displayTitle = title || t('home');

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('登出失敗:', error);
    }
  };

  const navLinks = [
    { label: t('trips'), icon: Compass, onClick: () => router.push('/trips') },
    { label: t('stats'), icon: BarChart3, onClick: () => router.push('/stats') },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* 左側：Logo 和標題 */}
        <div className="flex items-center cursor-pointer" onClick={() => router.push('/')}>
          <span className="text-xl font-semibold text-foreground">
            {displayTitle}
          </span>
        </div>

        {/* 中間：導航按鈕 (Desktop) */}
        {showUserMenu && user && (
          <div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 gap-1">
            {navLinks.map((link) => (
              <ShadcnButton
                key={link.label}
                variant="ghost"
                onClick={link.onClick}
                className="gap-2"
              >
                <link.icon size={20} />
                {link.label}
              </ShadcnButton>
            ))}
          </div>
        )}

        {/* 右側：功能區 */}
        <div className="flex items-center gap-2">
          {/* 語言切換 */}
          <LanguageSwitcher />

          {/* 主題切換按鈕 */}
          <ShadcnButton
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-foreground"
          >
            {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </ShadcnButton>

          {showUserMenu && user ? (
            <>
              {/* Mobile Menu Trigger */}
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ShadcnButton variant="ghost" size="icon">
                      <MenuIcon size={24} />
                    </ShadcnButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push('/trips')}>
                      <Compass className="mr-2 h-4 w-4" />
                      <span>{t('trips')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/stats')}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      <span>{t('stats')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>{t('settings')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>{t('logout')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Desktop User Menu */}
              <div className="hidden md:flex items-center gap-2">
                <span className="text-sm text-muted-foreground mr-1">
                  {user.display_name || user.username}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ShadcnButton variant="ghost" size="icon" className="rounded-full">
                      <ShadcnAvatar className="h-8 w-8">
                        <AvatarImage src="" />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {(user.display_name || user.username).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </ShadcnAvatar>
                    </ShadcnButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>{t('settings')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>{t('logout')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
