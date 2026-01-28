'use client';

import { Box, Container, Typography, Card, CardContent } from '@mui/material';
import { Plus, Calculator, CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Features() {
    const t = useTranslations('home');

    return (
        <Box sx={{ py: { xs: 6, sm: 8 }, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Typography
                    variant="h3"
                    sx={{
                        textAlign: 'center',
                        mb: { xs: 4, sm: 6 },
                        fontWeight: 700,
                        fontSize: { xs: '1.75rem', sm: '2rem' },
                    }}
                >
                    {t('features.title')}
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                        gap: { xs: 3, sm: 4 },
                        px: { xs: 2, sm: 0 },
                    }}
                >
                    <Card
                        sx={{
                            height: '100%',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            },
                        }}
                    >
                        <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                            <Box
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: '12px',
                                    bgcolor: 'primary.main',
                                    mb: 2,
                                }}
                            >
                                <Plus size={28} color="white" />
                            </Box>
                            <Typography
                                variant="h6"
                                fontWeight={600}
                                gutterBottom
                                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
                            >
                                {t('features.easyTracking.title')}
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            >
                                {t('features.easyTracking.description')}
                            </Typography>
                        </CardContent>
                    </Card>

                    <Card
                        sx={{
                            height: '100%',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            },
                        }}
                    >
                        <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                            <Box
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: '12px',
                                    bgcolor: 'primary.main',
                                    mb: 2,
                                }}
                            >
                                <Calculator size={28} color="white" />
                            </Box>
                            <Typography
                                variant="h6"
                                fontWeight={600}
                                gutterBottom
                                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
                            >
                                {t('features.smartSplit.title')}
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            >
                                {t('features.smartSplit.description')}
                            </Typography>
                        </CardContent>
                    </Card>

                    <Card
                        sx={{
                            height: '100%',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            },
                        }}
                    >
                        <CardContent sx={{ textAlign: 'center', p: { xs: 3, sm: 4 } }}>
                            <Box
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 56,
                                    height: 56,
                                    borderRadius: '12px',
                                    bgcolor: 'primary.main',
                                    mb: 2,
                                }}
                            >
                                <CreditCard size={28} color="white" />
                            </Box>
                            <Typography
                                variant="h6"
                                fontWeight={600}
                                gutterBottom
                                sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}
                            >
                                {t('features.quickSettlement.title')}
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                            >
                                {t('features.quickSettlement.description')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>
            </Container>
        </Box>
    );
}
