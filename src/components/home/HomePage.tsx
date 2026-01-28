'use client';

import { Box, Container } from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import { LoginForm } from '@/components/login';

export default function HomePage() {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Navbar showUserMenu={false} />

            <Container maxWidth="lg" sx={{ pt: { xs: 10, md: 12 }, pb: 8 }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                        gap: { xs: 4, md: 8 },
                        alignItems: 'center',
                    }}
                >
                    {/* Left Side: Hero / Intro */}
                    <Box>
                        <Hero />
                    </Box>

                    {/* Right Side: Login Form */}
                    <Box>
                        <LoginForm hideBackToHome />
                    </Box>
                </Box>
            </Container>
        </Box>
    );
}
