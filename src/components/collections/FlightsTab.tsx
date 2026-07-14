'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Medal, Pencil, Plane, Plus, Trash2 } from 'lucide-react';

import { summarizeAirlines, formatByPrecision } from '@/lib/collections';
import { ALLIANCE_COUNT } from '@/constants/alliances';
import { useAirlines, useCollectionMutations, useLoyalty, getAirlineName } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { FlightRecordItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState } from '@/components/common';
import { FlightRecordDialog } from './FlightRecordDialog';
import { LoyaltyEntryDialog } from './LoyaltyEntryDialog';
import { RecordYearGroups } from './RecordYearGroups';
import { StatTiles } from './RecordFormFields';

/**
 * 航空收藏 tab：統計磚＋「搭過的航空公司」徽章牆＋逐筆飛行紀錄（可編輯/刪除）。
 */
export function FlightsTab({ flights }: { flights: FlightRecordItem[] }) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const { toast } = useToast();
  const { removeFlight } = useCollectionMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FlightRecordItem | null>(null);
  const [deleting, setDeleting] = useState<FlightRecordItem | null>(null);
  const [importing, setImporting] = useState<FlightRecordItem | null>(null);

  const { data: airlines } = useAirlines(flights.length > 0);

  // 「記入會籍積分」：有設定會籍帳戶才顯示按鈕；已帶入的航班依 entries 反查停用
  const { data: loyalty } = useLoyalty(flights.length > 0);
  const loyaltyAccount = loyalty?.accounts[0] ?? null;
  const importedFlightIds = useMemo(
    () =>
      new Set(
        (loyalty?.entries ?? [])
          .map((e) => e.flight_record_id)
          .filter((id): id is string => id !== null)
      ),
    [loyalty]
  );
  const airlineByIata = useMemo(
    () => new Map((airlines ?? []).map((a) => [a.iata, a])),
    [airlines]
  );

  const summaries = useMemo(() => summarizeAirlines(flights), [flights]);
  const alliancesCollected = useMemo(() => {
    const set = new Set<string>();
    for (const s of summaries) {
      const alliance = airlineByIata.get(s.airline)?.alliance;
      if (alliance) set.add(alliance);
    }
    return set.size;
  }, [summaries, airlineByIata]);

  const airlineLabel = (iata: string) => {
    const entry = airlineByIata.get(iata);
    return entry ? getAirlineName(entry, locale) : iata;
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeFlight.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  if (flights.length === 0) {
    return (
      <>
        <EmptyState
          icon={Plane}
          title={t('flights.empty')}
          description={t('flights.emptyDesc')}
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('flights.addFlight')}
            </Button>
          }
        />
        <FlightRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <StatTiles
        tiles={[
          { label: t('flights.stats.flights'), value: flights.length },
          { label: t('flights.stats.airlines'), value: summaries.length },
          { label: t('flights.stats.alliances'), value: `${alliancesCollected}/${ALLIANCE_COUNT}` },
        ]}
      />

      {/* 航空公司徽章牆 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t('flights.airlineWall')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {summaries.map((s) => {
            const entry = airlineByIata.get(s.airline);
            return (
              <div key={s.airline} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                    {s.airline}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {airlineLabel(s.airline)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('flights.timesFlown', { count: s.count })}
                    </div>
                  </div>
                </div>
                {entry?.alliance && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {t(`flights.alliance.${entry.alliance}`)}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 逐筆紀錄 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('common.records')}</h2>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t('flights.addFlight')}
          </Button>
        </div>
        <RecordYearGroups
          items={flights}
          getDate={(f) => f.date}
          renderRow={(f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {airlineLabel(f.airline)}
                  </span>
                  {f.flight_no && (
                    <span className="font-mono text-xs text-muted-foreground">{f.flight_no}</span>
                  )}
                  {f.cabin && (
                    <Badge variant="secondary" className="text-xs">
                      {t(`flights.cabins.${f.cabin}`)}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatByPrecision(f.date, f.date_precision)}</span>
                  {f.from_airport && f.to_airport && (
                    <span className="flex items-center gap-1 font-mono">
                      {f.from_airport}
                      <ArrowRight className="h-3 w-3" />
                      {f.to_airport}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {loyaltyAccount && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t(
                      importedFlightIds.has(f.id) ? 'loyalty.imported' : 'loyalty.importFlight'
                    )}
                    disabled={importedFlightIds.has(f.id)}
                    onClick={() => setImporting(f)}
                  >
                    <Medal
                      className={importedFlightIds.has(f.id) ? 'h-4 w-4 text-primary' : 'h-4 w-4'}
                    />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('common.edit')}
                  onClick={() => {
                    setEditing(f);
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
                  onClick={() => setDeleting(f)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        />
      </section>

      <FlightRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      {loyaltyAccount && (
        <LoyaltyEntryDialog
          open={importing !== null}
          onOpenChange={(next) => !next && setImporting(null)}
          program={loyaltyAccount.program}
          editing={null}
          defaults={
            importing
              ? {
                  type: 'flight',
                  date: importing.date,
                  flight_record_id: importing.id,
                  note: importing.flight_no || airlineLabel(importing.airline),
                }
              : null
          }
          onSaved={() => toast({ title: t('loyalty.importedToast') })}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={t('flights.deleteTitle')}
        message={t('flights.deleteMessage')}
        severity="error"
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={removeFlight.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
