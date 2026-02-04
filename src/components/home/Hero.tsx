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
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: { xs: 120, sm: 180, md: 240 },
                            height: { xs: 120, sm: 180, md: 240 },
                            mb: { xs: 3, sm: 4 },
                            position: 'relative',
                        }}
                    >
                        <Image
                            src="/take-my-money.png"
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
                            fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
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
                            fontSize: { xs: '1rem', sm: '1.25rem' },
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
