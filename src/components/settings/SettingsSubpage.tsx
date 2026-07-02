'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';

/**
 * 「我的」子頁殼（UI/UX 重設計 5.5）：返回鍵（回 /settings 選單）+ 頁標題 + 內容。
 * /settings 由單頁平鋪拆成列表選單＋子頁後，各子頁共用這個輕量頁首。
 */
export function SettingsSubpage({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const tCommon = useTranslations('common');

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 pb-8">
      <div className="mb-6 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 -ml-2 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={tCommon('back')}
          onClick={() => router.push(ROUTES.SETTINGS)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </div>
      {children}
    </div>
  );
}
