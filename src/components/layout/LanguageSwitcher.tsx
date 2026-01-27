'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { IconButton, Menu, MenuItem, Box } from '@mui/material';
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { Locale } from '@/i18n/routing';

const languages: Record<Locale, string> = {
  en: 'English',
  zh: '繁體中文',
  'zh-CN': '简体中文',
  jp: '日本語',
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: Locale) => {
    // next-intl 的 useRouter 會自動處理 locale 前綴
    router.replace(pathname, { locale: newLocale });
    handleClose();
  };

  return (
    <Box>
      <IconButton
        onClick={handleClick}
        color="inherit"
        aria-label="change language"
        sx={{
          color: 'text.secondary',
          '&:hover': {
            color: 'text.primary',
          },
        }}
      >
        <Globe size={24} />
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
        {(Object.entries(languages) as [Locale, string][]).map(([code, name]) => (
          <MenuItem
            key={code}
            onClick={() => handleLanguageChange(code)}
            selected={code === locale}
          >
            {name}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
