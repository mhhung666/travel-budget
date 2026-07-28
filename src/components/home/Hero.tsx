'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function Hero() {
  const t = useTranslations('home');

  return (
    <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
      <div className="mb-5 flex items-center gap-3 lg:mb-7">
        <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24 lg:h-28 lg:w-28">
          <Image
            src="/icon-512.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 112px, (min-width: 640px) 96px, 80px"
            className="object-contain"
            priority
          />
        </div>
        <div className="text-left lg:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {t('hero.eyebrow')}
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">{t('title')}</p>
        </div>
      </div>

      <p className="mb-3 hidden text-sm font-semibold uppercase tracking-[0.2em] text-primary lg:block">
        {t('hero.eyebrow')}
      </p>
      <h1 className="max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.12]">
        {t('hero.title')}
      </h1>
      <p className="mt-4 max-w-lg text-balance text-base leading-7 text-muted-foreground sm:text-lg">
        {t('hero.subtitle')}
      </p>
    </div>
  );
}
