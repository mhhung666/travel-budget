'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronDown, Globe, MapPin } from 'lucide-react';
import { getCountryFlag } from '@/constants/countries';
import type { CountryStat } from '@/types';
import Badge from './Badge';

interface CountryStatsProps {
  countries: CountryStat[];
  cardGradient: string;
  t: (key: string) => string;
}

export default function CountryStats({
  countries,
  cardGradient,
  t,
}: CountryStatsProps) {
  const theme = useTheme();

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            display: 'flex',
            boxShadow: '0 4px 6px -1px rgba(100, 116, 139, 0.4)'
          }}
        >
          <Globe size={20} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          {t('countryStats')}
        </Typography>
        {countries.length > 0 && (
          <Chip
            label={`${countries.length}`}
            size="small"
            sx={{ borderRadius: '6px', fontWeight: 700, bgcolor: alpha(theme.palette.secondary.main, 0.1), color: 'secondary.main' }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {countries.length > 0 ? (
          countries.map((country, index) => (
            <Accordion
              key={country.country}
              elevation={0}
              disableGutters
              sx={{
                background: cardGradient,
                borderRadius: '16px !important',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:before': { display: 'none' },
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 20px -10px rgba(0, 0, 0, 0.1)',
                  borderColor: 'secondary.light',
                },
                animation: `fadeIn 0.5s ease-out ${index * 0.1 + 0.2}s both`,
              }}
            >
              <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                      sx={{
                        width: 48, height: 40,
                        fontSize: '2rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1
                      }}
                    >
                      {getCountryFlag(country.country_code)}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {country.country}
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip
                    label={`${country.tripCount} ${t('trips')}`}
                    size="small"
                    sx={{ borderRadius: '8px', fontWeight: 600 }}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 2 }}>
                <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
                <Stack spacing={1}>
                  {country.regions.map((region) => (
                    <Box
                      key={region.name}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.1) }
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <MapPin size={18} className="text-gray-400" />
                        <Typography variant="body2" fontWeight={500}>{region.name}</Typography>
                      </Stack>
                      <Badge count={region.tripCount} label={t('trips')} />
                    </Box>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))
        ) : (
          <Box sx={{ textAlign: 'center', py: 8, opacity: 0.6 }}>
            <Globe size={48} strokeWidth={1} style={{ marginBottom: 16 }} />
            <Typography variant="body1" color="text.secondary">
              {t('noData')}
            </Typography>
          </Box>
        )}
      </Box>
    </>
  );
}
