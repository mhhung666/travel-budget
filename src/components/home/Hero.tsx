'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function Hero() {
  const t = useTranslations('home');

  return (
    <div className="mb-8 flex flex-col items-center text-center">
      {/* Brand image */}
      <div className="relative mb-4 h-28 w-28 sm:h-32 sm:w-32">
        <Image
          src="/icon-512.png"
          alt="Take my money!"
          fill
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      {/* Title */}
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('hero.title')}
      </h1>
      <p className="text-balance mt-2 text-sm text-muted-foreground sm:text-base">
        {t('hero.subtitle')}
      </p>
    </div>
  );
}
