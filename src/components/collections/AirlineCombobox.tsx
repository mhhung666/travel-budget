'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronsUpDown, Plane } from 'lucide-react';

import { useAirlines, getAirlineName, type AirlineEntry } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AirlineComboboxProps {
  /** IATA 二碼；null＝未選。 */
  value: string | null;
  onChange: (iata: string) => void;
  disabled?: boolean;
}

const MAX_RESULTS = 50;

/**
 * 可搜尋的航空公司選擇器（目錄：public/data/airlines.json，開啟時才載入）。
 * 目錄逾千筆，改為手動過濾＋上限 50 筆：未輸入時先列常用航空（有繁中名者）。
 */
export function AirlineCombobox({ value, onChange, disabled }: AirlineComboboxProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // 開啟過或已有選值（需要顯示名稱）才抓目錄
  const { data: airlines } = useAirlines(open || Boolean(value));

  const selected = useMemo(() => airlines?.find((a) => a.iata === value), [airlines, value]);

  const options = useMemo<AirlineEntry[]>(() => {
    if (!airlines) return [];
    const q = search.trim().toLowerCase();
    if (!q) {
      // 常用（有繁中名的 overlay 名單）優先，其餘按目錄序補滿
      const common = airlines.filter((a) => a.nameZh && !a.defunct);
      return common.slice(0, MAX_RESULTS);
    }
    return airlines
      .filter(
        (a) =>
          a.iata.toLowerCase().startsWith(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.nameZh ?? '').includes(search.trim())
      )
      .slice(0, MAX_RESULTS);
  }, [airlines, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs text-muted-foreground">{selected.iata}</span>
              {getAirlineName(selected, locale)}
            </span>
          ) : value ? (
            <span className="font-mono">{value}</span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Plane className="h-4 w-4" />
              {t('flights.searchAirline')}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('flights.searchAirline')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{t('common.noMatch')}</CommandEmpty>
            {options.map((a) => (
              <CommandItem
                key={a.iata}
                value={a.iata}
                onSelect={() => {
                  onChange(a.iata);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="w-8 shrink-0 font-mono text-xs font-medium">{a.iata}</span>
                <span className="truncate">{getAirlineName(a, locale)}</span>
                {a.defunct && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {t('flights.defunct')}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
