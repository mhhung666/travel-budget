'use client';

import { Box, Container, Typography, Button } from '@mui/material';
import { Compass, ArrowRight } from 'lucide-react';
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
                    {/* Icon */}
                    <Box
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: { xs: 64, sm: 80 },
                            height: { xs: 64, sm: 80 },
                            borderRadius: '20px',
                            bgcolor: 'primary.main',
                            mb: { xs: 3, sm: 4 },
                        }}
                    >
                        <Box component="span" sx={{ fontSize: { xs: 36, sm: 48 }, color: 'white', display: 'flex' }}>
                            <Compass size={undefined} width="1em" height="1em" />
                        </Box>
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
