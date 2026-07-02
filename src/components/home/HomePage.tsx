'use client';

import { Fragment } from 'react';
import { Compass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Hero from '@/components/home/Hero';
import { LoginForm } from '@/components/login';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const FEATURE_KEYS = ['easyTracking', 'smartSplit', 'quickSettlement'] as const;

export default function HomePage() {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Dotted texture, faded toward the edges */}
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] bg-[size:22px_22px] opacity-[0.035] [mask-image:radial-gradient(ellipse_55%_50%_at_50%_40%,black,transparent)]" />
        {/* Single soft glow focused behind the card */}
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      {/* 輕量頂列：logo + 語言/主題（登入表單即在頁面內，無需登入 CTA） */}
      <header className="sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold text-foreground">{tNav('home')}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 pb-24 pt-6">
        <div className="w-full max-w-md">
          <Hero />
          <LoginForm hideBackToHome />

          {/* Minimal feature strip */}
          <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
            {FEATURE_KEYS.map((key, i) => (
              <Fragment key={key}>
                {i > 0 && (
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                )}
                <span>{t(`features.${key}.title`)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
