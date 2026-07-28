'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eye, EyeOff, Hotel, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import { summarizeBrands, formatByPrecision } from '@/lib/collections';
import {
  HOTEL_BRANDS,
  HOTEL_TIERS,
  getHotelBrand,
  getHotelBrandName,
  type HotelBrand,
  type HotelTier,
} from '@/constants/hotelBrands';
import { useCollectionMutations, useLoyalty } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { StayRecordItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfirmDialog, EmptyState } from '@/components/common';
import { StayRecordDialog } from './StayRecordDialog';
import { RecordYearGroups } from './RecordYearGroups';
import { StatTiles } from './RecordFormFields';

/** tier → 徽章圓環色（品牌牆的「等級」視覺語彙；不用商標圖，用 monogram＋語意 token 色環）。 */
const TIER_RING: Record<HotelTier, string> = {
  luxury: 'ring-warning/70 text-warning bg-warning/10',
  upscale: 'ring-primary/70 text-primary bg-primary/10',
  midscale: 'ring-info/70 text-info bg-info/10',
  budget: 'ring-success/70 text-success bg-success/10',
  hostel: 'ring-muted-foreground/50 text-muted-foreground bg-muted',
};

/** 品牌 monogram：英文名取前兩個單字的首字母（單字不足補第二個字母）。 */
function monogram(brand: HotelBrand): string {
  const words = brand.name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return brand.name.slice(0, 2).toUpperCase();
}

function BrandRoundel({ brand, dimmed }: { brand: HotelBrand; dimmed?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2',
        TIER_RING[brand.tier],
        dimmed && 'opacity-40 grayscale'
      )}
    >
      {monogram(brand)}
    </div>
  );
}

/**
 * 住宿收藏 tab：統計磚＋品牌收藏牆（住過的點亮、可切換顯示未收集圖鑑）＋逐筆紀錄。
 */
export function StaysTab({ stays }: { stays: StayRecordItem[] }) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { toast } = useToast();
  const { removeStay } = useCollectionMutations();
  const { data: loyalty } = useLoyalty();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StayRecordItem | null>(null);
  const [deleting, setDeleting] = useState<StayRecordItem | null>(null);
  const [showUncollected, setShowUncollected] = useState(false);

  const summaries = useMemo(
    () =>
      summarizeBrands(
        stays.map((s) => ({
          brand: s.brand,
          hotelName: s.hotel_name,
          checkIn: s.check_in,
          nights: s.nights,
        }))
      ),
    [stays]
  );
  const brandSummaries = summaries.filter((s) => s.brand !== null);
  const independent = summaries.find((s) => s.brand === null);
  const totalNights = summaries.reduce((sum, s) => sum + s.nights, 0);
  const hasMarriottAccount = loyalty?.accounts.some((account) => account.program === 'MB') ?? false;
  const marriottLinkedStayIds = useMemo(
    () =>
      new Set(
        (loyalty?.entries ?? [])
          .filter((entry) => entry.program === 'MB' && entry.stay_record_id)
          .map((entry) => entry.stay_record_id!)
      ),
    [loyalty]
  );

  const collectedIds = useMemo(
    () => new Set(brandSummaries.map((s) => s.brand as string)),
    [brandSummaries]
  );
  const uncollectedByTier = useMemo(() => {
    const map = new Map<HotelTier, HotelBrand[]>();
    for (const tier of HOTEL_TIERS) map.set(tier, []);
    for (const b of HOTEL_BRANDS) {
      if (!collectedIds.has(b.id)) map.get(b.tier)!.push(b);
    }
    return map;
  }, [collectedIds]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeStay.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  if (stays.length === 0) {
    return (
      <>
        <EmptyState
          icon={Hotel}
          title={t('stays.empty')}
          description={t('stays.emptyDesc')}
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('stays.addStay')}
            </Button>
          }
        />
        <StayRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <StatTiles
        tiles={[
          { label: t('stays.stats.stays'), value: stays.length },
          { label: t('stays.stats.brands'), value: brandSummaries.length },
          { label: t('stays.stats.nights'), value: totalNights },
        ]}
      />

      {/* 品牌收藏牆 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('stays.brandWall')}</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowUncollected((v) => !v)}>
            {showUncollected ? (
              <EyeOff className="mr-1 h-4 w-4" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            {showUncollected ? t('stays.hideUncollected') : t('stays.showUncollected')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brandSummaries.map((s) => {
            const brand = getHotelBrand(s.brand)!;
            return (
              <div key={s.brand} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <BrandRoundel brand={brand} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {getHotelBrandName(brand, locale)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('stays.staysCount', { count: s.stayCount })}
                      {s.nights > 0 && <> · {t('stays.nightsCount', { count: s.nights })}</>}
                    </div>
                  </div>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {s.hotelNames.join('、')}
                </p>
              </div>
            );
          })}
          {independent && (
            <div className="rounded-xl border border-dashed bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Hotel className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {t('stays.independent')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('stays.staysCount', { count: independent.stayCount })}
                  </div>
                </div>
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {independent.hotelNames.join('、')}
              </p>
            </div>
          )}
        </div>

        {/* 未收集圖鑑（依等級分組的灰階徽章） */}
        {showUncollected && (
          <div className="mt-4 space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
            {HOTEL_TIERS.map((tier) => {
              const brands = uncollectedByTier.get(tier)!;
              if (brands.length === 0) return null;
              return (
                <div key={tier}>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                    {t(`stays.tiers.${tier}`)}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {brands.map((b) => (
                      <span
                        key={b.id}
                        className="flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground opacity-70"
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-1',
                            TIER_RING[b.tier],
                            'opacity-50 grayscale'
                          )}
                        >
                          {monogram(b)}
                        </span>
                        {getHotelBrandName(b, locale)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 逐筆紀錄 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('common.records')}</h2>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t('stays.addStay')}
          </Button>
        </div>
        <RecordYearGroups
          items={stays}
          getDate={(s) => s.check_in}
          renderRow={(s) => {
            const brand = getHotelBrand(s.brand);
            const linkedToMarriott = marriottLinkedStayIds.has(s.id);
            const canAddToMarriott =
              hasMarriottAccount && brand?.group === 'marriott' && !linkedToMarriott;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-foreground">{s.hotel_name}</span>
                    {brand && (
                      <Badge variant="secondary" className="text-xs">
                        {getHotelBrandName(brand, locale)}
                      </Badge>
                    )}
                    {s.stars != null && (
                      <span className="flex items-center gap-0.5 text-xs text-warning">
                        {s.stars}
                        <Star className="h-3 w-3 fill-current" />
                      </span>
                    )}
                    {linkedToMarriott && (
                      <Badge variant="outline" className="text-xs">
                        Bonvoy
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatByPrecision(s.check_in, s.date_precision)}</span>
                    {s.nights != null && <span>{t('stays.nightsCount', { count: s.nights })}</span>}
                    {s.city && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {s.city}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {canAddToMarriott && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      aria-label={t('stays.addToMarriott')}
                      title={t('stays.addToMarriott')}
                      onClick={() => {
                        setEditing(s);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('common.edit')}
                    onClick={() => {
                      setEditing(s);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          }}
        />
      </section>

      <StayRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <ConfirmDialog
        open={deleting !== null}
        title={t('stays.deleteTitle')}
        message={t('stays.deleteMessage')}
        severity="error"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={removeStay.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
