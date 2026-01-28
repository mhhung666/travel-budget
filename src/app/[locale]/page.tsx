'use client';

import { Box } from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';

export default function Home() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar showUserMenu={false} />
      <Hero />
      <Features />
    </Box>
  );
}
