'use client';

import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import { LoginForm } from '@/components/login';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar showUserMenu={false} />

      <div className="container mx-auto px-4 pt-24 pb-16 md:pt-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
          {/* Left Side: Hero / Intro */}
          <div>
            <Hero />
          </div>

          {/* Right Side: Login Form */}
          <div>
            <LoginForm hideBackToHome />
          </div>
        </div>
      </div>
    </div>
  );
}
