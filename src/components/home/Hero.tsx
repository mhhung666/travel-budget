'use client';

import Image from 'next/image';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function Hero() {
    const router = useRouter();
    const t = useTranslations('home');

    return (
        <div className="flex items-center w-full">
            <div className="container mx-auto px-4 md:px-0">
                <div className="text-center md:text-left max-w-[800px] mx-auto md:mx-0">
                    {/* Fun Image */}
                    <div className="flex items-center justify-center w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] md:w-[360px] md:h-[360px] mb-2 sm:mb-4 mx-auto relative">
                        <Image
                            src="/shut-up-and-take-my-money.png"
                            alt="Take my money!"
                            fill
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
                        {t('hero.title')}
                    </h1>

                    <p className="text-lg sm:text-xl text-muted-foreground mb-8 md:mb-12 font-normal px-4 sm:px-0">
                        {t('hero.subtitle')}
                    </p>
                </div>
            </div>
        </div>
    );
}
