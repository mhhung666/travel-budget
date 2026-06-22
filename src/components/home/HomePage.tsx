'use client';

import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import { LoginForm } from '@/components/login';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Dotted texture, faded toward the edges */}
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] bg-[size:22px_22px] opacity-[0.035] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_30%,black,transparent)]" />
        {/* Soft ambient glows */}
        <div className="absolute -top-24 left-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 translate-x-1/2 rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <Navbar showUserMenu={false} />

      <main className="container mx-auto flex min-h-screen items-center px-4 pb-16 pt-24 md:pt-28">
        <div className="grid w-full grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* Left: Hero / Intro */}
          <Hero />

          {/* Right: Login Form */}
          <div className="mx-auto w-full max-w-md md:ml-auto md:mr-0">
            <LoginForm hideBackToHome />
          </div>
        </div>
      </main>
    </div>
  );
}
