'use client';

import { Box, Container } from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import { LoginForm } from '@/components/login';

export default function LoginPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar showUserMenu={false} />

      <Box
        sx={{
          pt: { xs: 10, sm: 12 },
          pb: { xs: 4, sm: 6 },
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
        }}
      >
        <Container maxWidth="sm">
          <LoginForm />
        </Container>
      </Box>
    </Box>
  );
}
