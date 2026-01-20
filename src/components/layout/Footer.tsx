'use client';

import { Box, Container, Typography, Link } from '@mui/material';
import { TravelExplore } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        backgroundColor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
          }}
        >

          <Typography variant="body2" color="text.secondary">
            © {currentYear} {t('copyright')}
          </Typography>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Link
              href="https://github.com/mhhung666"
              target="_blank"
              rel="noopener noreferrer"
              color="text.secondary"
              underline="hover"
              sx={{ fontSize: '0.875rem' }}
            >
              GitHub
            </Link>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
