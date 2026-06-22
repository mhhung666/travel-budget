'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import { LoginForm } from '@/components/login';

const FEATURE_KEYS = ['easyTracking', 'smartSplit', 'quickSettlement'] as const;

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Dotted texture, faded toward the edges */}
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] bg-[size:22px_22px] opacity-[0.035] [mask-image:radial-gradient(ellipse_55%_50%_at_50%_40%,black,transparent)]" />
        {/* Single soft glow focused behind the card */}
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <Navbar showUserMenu={false} />

      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-24">
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
