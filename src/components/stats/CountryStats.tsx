'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Globe, MapPin, ChevronDown } from 'lucide-react';
import { getCountryFlag } from '@/constants/countries';
import type { CountryStat } from '@/types';
import { cn } from '@/lib/utils';

interface CountryStatsProps {
  countries: CountryStat[];
  cardGradient: string;
  t: (key: string) => string;
}

export default function CountryStats({
  countries,
  t,
}: CountryStatsProps) {

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-secondary text-secondary-foreground shadow-sm">
          <Globe size={20} />
        </div>
        <h2 className="text-xl font-bold">
          {t('countryStats')}
        </h2>
        {countries.length > 0 && (
          <Badge variant="secondary" className="text-sm font-bold px-2 py-0.5 rounded-md">
            {countries.length}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {countries.length > 0 ? (
          <Accordion type="single" collapsible className="space-y-3">
            {countries.map((country, index) => (
              <AccordionItem
                key={country.country}
                value={country.country}
                className="border rounded-2xl bg-card border-none shadow-sm px-1 data-[state=open]:shadow-md transition-all duration-200"
              >
                <AccordionTrigger className="hover:no-underline px-4 py-3 [&[data-state=open]>div>svg]:rotate-180">
                  <div className="flex w-full items-center justify-between pr-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-10 flex items-center justify-center text-4xl leading-none">
                        {getCountryFlag(country.country_code)}
                      </div>
                      <div className="text-left">
                        <span className="font-semibold text-base">
                          {country.country}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-semibold px-2 py-1 rounded-lg">
                      {country.tripCount} {t('trips')}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-0">
                  <div className="my-2 border-t border-dashed border-border/50" />
                  <div className="space-y-2">
                    {country.regions.map((region) => (
                      <div
                        key={region.name}
                        className="flex justify-between items-center p-3 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin size={18} className="text-muted-foreground" />
                          <span className="font-medium text-sm">{region.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">
                          <span className="font-bold text-foreground">{region.tripCount}</span>
                          <span>{t('trips')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="text-center py-12 opacity-60 flex flex-col items-center">
            <Globe size={48} strokeWidth={1} className="mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t('noData')}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
