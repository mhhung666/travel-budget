'use client';

import { Box, Container, Typography, Button } from '@mui/material';
import Image from 'next/image';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function Hero() {
    const router = useRouter();
    const t = useTranslations('home');

    return (
        <Box
            sx={{
                // pt: { xs: 12, sm: 16 },
                // pb: { xs: 8, sm: 12 },
                // minHeight: { xs: 'calc(100vh - 64px)', sm: '85vh' },
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <Container maxWidth="lg">
                <Box
                    sx={{
                        textAlign: { xs: 'center', md: 'left' },
                        maxWidth: '800px',
                        mx: { xs: 'auto', md: 0 },
                    }}
                >
                    {/* Fun Image */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: { xs: 200, sm: 280, md: 360 },
                            height: { xs: 200, sm: 280, md: 360 },
                            mb: { xs: 0.5, sm: 1 },
                            mx: 'auto',
                            position: 'relative',
                        }}
                    >
                        <Image
                            src="/shut-up-and-take-my-money.png"
                            alt="Take my money!"
                            fill
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </Box>

                    {/* Title */}
                    <Typography
                        variant="h1"
                        component="h1"
                        sx={{
                            fontWeight: 700,
                            color: 'text.primary',
                            mb: 2,
                            fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
                        }}
                    >
                        {t('hero.title')}
                    </Typography>

                    <Typography
                        variant="h5"
                        sx={{
                            color: 'text.secondary',
                            mb: { xs: 4, sm: 6 },
                            fontWeight: 400,
                            fontSize: { xs: '0.875rem', sm: '1.1rem' },
                            px: { xs: 2, sm: 0 },
                        }}
                    >
                        {t('hero.subtitle')}
                    </Typography>
                </Box>
            </Container>
        </Box>
    );
}
