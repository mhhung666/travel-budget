'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** 外觀（/settings/appearance）：主題三段切換 + 語言。自 settings 單頁拆出（5.5）。 */
export function AppearanceSection() {
  const t = useTranslations('settings');
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-foreground">{t('appearance.theme')}</span>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['light', 'dark', 'system'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={theme === value ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setTheme(value)}
              >
                {t(`appearance.${value}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-foreground">{t('appearance.language')}</span>
          <LanguageSwitcher showLabel />
        </div>
      </CardContent>
    </Card>
  );
}
