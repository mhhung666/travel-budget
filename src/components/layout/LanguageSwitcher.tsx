'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Globe } from 'lucide-react';
import { Locale } from '@/i18n/routing';
import { setLocale } from '@/actions';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languages: Record<Locale, string> = {
  en: 'English',
  zh: '繁體中文',
  'zh-CN': '简体中文',
  jp: '日本語',
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = (newLocale: Locale) => {
    if (newLocale === locale) return;
    startTransition(async () => {
      // 寫入 NEXT_LOCALE cookie（並在已登入時同步 User.locale）。
      await setLocale(newLocale);
      // cookie 已更新 → 重新取得對應語系的伺服端內容；不跳網址、不整頁 reload。
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground"
        >
          <Globe className="h-5 w-5" />
          <span className="sr-only">Change language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.entries(languages) as [Locale, string][]).map(([code, name]) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleLanguageChange(code)}
            className={code === locale ? 'bg-accent' : ''}
          >
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
