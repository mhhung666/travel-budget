'use client';

import { useTranslations } from 'next-intl';

export default function Hero() {
  const t = useTranslations('home');

  return (
    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <div className="mb-3 text-left sm:mb-5 lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {t('hero.eyebrow')}
        </p>
        <p className="mt-1 text-lg font-bold text-foreground">{t('title')}</p>
      </div>

      <p className="mb-3 hidden text-sm font-semibold uppercase tracking-[0.2em] text-primary lg:block">
        {t('hero.eyebrow')}
      </p>
      {/* break-keep：中文標語只在標點處換行，避免「足跡」被拆成兩行；過長時 anywhere 仍可斷 */}
      <h1 className="max-w-xl text-balance break-keep text-2xl font-bold [overflow-wrap:anywhere] leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.12]">
        {t('hero.title')}
      </h1>
      {/* 手機版省略副標，讓登入按鈕進入首屏；完整功能說明仍在下方 Features */}
      <p className="mt-4 hidden max-w-lg text-balance text-base leading-7 text-muted-foreground sm:block sm:text-lg">
        {t('hero.subtitle')}
      </p>
    </div>
  );
}
