'use client';

import { useTranslations } from 'next-intl';
import { Award, Globe2, Hotel, Medal, Plane } from 'lucide-react';

import { useCollections } from '@/hooks/queries';
import { LoadingState } from '@/components/common';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlightsTab } from './FlightsTab';
import { StaysTab } from './StaysTab';
import { CountriesTab } from './CountriesTab';
import { BadgesTab } from './BadgesTab';
import { LoyaltyTab } from './LoyaltyTab';

/**
 * 旅行成就頁（/collections，ROADMAP #19 P1）：
 * 航空／住宿為 user-level 終身紀錄（成就頁手動補登），國家由旅程資料自動推導。
 */
export function CollectionsView() {
  const t = useTranslations('collections');
  const { data, isLoading } = useCollections();

  if (isLoading || !data) {
    return <LoadingState />;
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <Tabs defaultValue="flights">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="flights" className="gap-1.5">
            <Plane className="h-4 w-4" aria-hidden />
            {t('tabs.flights')}
          </TabsTrigger>
          <TabsTrigger value="stays" className="gap-1.5">
            <Hotel className="h-4 w-4" aria-hidden />
            {t('tabs.stays')}
          </TabsTrigger>
          <TabsTrigger value="countries" className="gap-1.5">
            <Globe2 className="h-4 w-4" aria-hidden />
            {t('tabs.countries')}
          </TabsTrigger>
          <TabsTrigger value="badges" className="gap-1.5">
            <Award className="h-4 w-4" aria-hidden />
            {t('tabs.badges')}
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="gap-1.5">
            <Medal className="h-4 w-4" aria-hidden />
            {t('tabs.loyalty')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="flights" className="mt-6">
          <FlightsTab flights={data.flights} />
        </TabsContent>
        <TabsContent value="stays" className="mt-6">
          <StaysTab stays={data.stays} />
        </TabsContent>
        <TabsContent value="countries" className="mt-6">
          <CountriesTab countries={data.countries} />
        </TabsContent>
        <TabsContent value="badges" className="mt-6">
          <BadgesTab flights={data.flights} stays={data.stays} countries={data.countries} />
        </TabsContent>
        <TabsContent value="loyalty" className="mt-6">
          <LoyaltyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
