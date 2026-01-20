'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { IconButton, Menu, MenuItem, Box } from '@mui/material';
import { Language } from '@mui/icons-material';
import { useState } from 'react';

const languages = {
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

  const handleLanguageChange = (newLocale: string) => {
    // 移除所有可能的 locale 前綴
    let pathWithoutLocale = pathname;
    for (const loc of Object.keys(languages)) {
      if (pathname.startsWith(`/${loc}/`)) {
        // e.g., /en/trips -> /trips (slice from position 3 for 'en')
        pathWithoutLocale = pathname.slice(loc.length + 1);
        break;
      } else if (pathname === `/${loc}`) {
        pathWithoutLocale = '/';
        break;
      }
    }

    // 如果是預設語言（中文），不需要前綴
    const newPath =
      newLocale === 'zh' ? pathWithoutLocale || '/' : `/${newLocale}${pathWithoutLocale}`;

    router.push(newPath);
    router.refresh();
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
        <Language />
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
        {Object.entries(languages).map(([code, name]) => (
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
