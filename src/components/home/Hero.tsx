'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Receipt, Users, Wallet } from 'lucide-react';

const FEATURES = [
  { icon: Receipt, key: 'easyTracking' },
  { icon: Users, key: 'smartSplit' },
  { icon: Wallet, key: 'quickSettlement' },
] as const;

export default function Hero() {
  const t = useTranslations('home');

  return (
    <div className="text-center md:text-left">
      {/* Brand image */}
      <div className="relative mx-auto mb-8 h-44 w-44 sm:h-52 sm:w-52 md:mx-0 md:h-60 md:w-60">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/[0.06] blur-2xl" />
        <Image
          src="/shut-up-and-take-my-money.png"
          alt="Take my money!"
          fill
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      {/* Title */}
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
        {t('hero.title')}
      </h1>

      <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground sm:text-xl md:mx-0">
        {t('hero.subtitle')}
      </p>

      {/* Feature highlights */}
      <ul className="mx-auto mt-10 grid max-w-md gap-4 md:mx-0">
        {FEATURES.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm">
              <Icon size={18} />
            </span>
            <div>
              <p className="font-medium text-foreground">{t(`features.${key}.title`)}</p>
              <p className="text-sm text-muted-foreground">{t(`features.${key}.description`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
