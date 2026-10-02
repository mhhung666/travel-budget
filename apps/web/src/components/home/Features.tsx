'use client';

import { BarChart3, MapPinned, Sparkles, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Features() {
  const t = useTranslations('home');

  const features = [
    {
      icon: Sparkles,
      titleKey: 'features.plan.title',
      descKey: 'features.plan.description',
    },
    {
      icon: BarChart3,
      titleKey: 'features.track.title',
      descKey: 'features.track.description',
    },
    {
      icon: UsersRound,
      titleKey: 'features.split.title',
      descKey: 'features.split.description',
    },
    {
      icon: MapPinned,
      titleKey: 'features.remember.title',
      descKey: 'features.remember.description',
    },
  ];

  return (
    <section aria-labelledby="feature-heading" className="mt-10 lg:mt-12">
      <div className="mb-5 text-center lg:text-left">
        <h2 id="feature-heading" className="text-xl font-bold text-foreground sm:text-2xl">
          {t('features.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('features.subtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:gap-4">
        {features.map((feature) => (
          <article
            key={feature.titleKey}
            className="group flex gap-4 rounded-2xl border border-border/70 bg-card/65 p-4 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:bg-card"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <feature.icon className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{t(feature.titleKey)}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(feature.descKey)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
