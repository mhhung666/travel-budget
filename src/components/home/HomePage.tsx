'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';
import { LoginForm } from '@/components/login';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function HomePage({ redirectTo }: { redirectTo?: string }) {
  const tNav = useTranslations('nav');

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] bg-[size:22px_22px] opacity-[0.035] [mask-image:radial-gradient(ellipse_70%_60%_at_42%_36%,black,transparent)]" />
        <div className="absolute -left-24 top-20 h-96 w-96 rounded-full bg-primary/[0.08] blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-primary/[0.06] blur-3xl" />
      </div>

      <header className="relative z-50 border-b border-border/50 bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="flex items-center gap-2">
            <Image
              src="/brand-mascot.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
            <span className="text-lg font-semibold text-foreground">{tNav('home')}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 sm:pt-12 lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.78fr)] lg:content-center lg:gap-x-16 lg:px-8 lg:py-14">
        <div className="mx-auto w-full max-w-2xl self-end lg:mx-0">
          <Hero />
        </div>

        <aside
          className="mt-8 self-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0"
          aria-label={tNav('login')}
        >
          <div className="mx-auto w-full max-w-md">
            <LoginForm hideBackToHome redirectTo={redirectTo} />
          </div>
        </aside>

        <div className="mx-auto w-full max-w-2xl self-start lg:mx-0">
          <Features />
        </div>
      </main>
    </div>
  );
}
