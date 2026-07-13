'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronsUpDown, X } from 'lucide-react';

import { useAirports, type AirportEntry } from '@/hooks/queries';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AirportComboboxProps {
  /** IATA 三碼；null＝未填（可選欄位）。 */
  value: string | null;
  onChange: (iata: string | null) => void;
  placeholder: string;
  disabled?: boolean;
}

const MAX_RESULTS = 50;

/**
 * 可搜尋的機場選擇器（目錄：public/data/airports.json ~4000 筆，開啟時才載入）。
 * 手動過濾＋上限 50 筆；欄位可選，已選時提供清除。
 */
export function AirportCombobox({ value, onChange, placeholder, disabled }: AirportComboboxProps) {
  const t = useTranslations('collections');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: airports } = useAirports(open || Boolean(value));

  const selected = useMemo(() => airports?.find((a) => a.iata === value), [airports, value]);

  const options = useMemo<AirportEntry[]>(() => {
    if (!airports) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return airports
      .filter(
        (a) =>
          a.iata.toLowerCase().startsWith(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.city ?? '').toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS);
  }, [airports, search]);

  const label = (a: AirportEntry) => (a.city ? `${a.city} · ${a.name}` : a.name);

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
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs text-muted-foreground">{value}</span>
              {selected && <span className="truncate">{label(selected)}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('flights.searchAirport')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {value && (
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.clear')}
              </CommandItem>
            )}
            <CommandEmpty>
              {search.trim() ? t('common.noMatch') : t('flights.searchAirportHint')}
            </CommandEmpty>
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
                <span className="w-10 shrink-0 font-mono text-xs font-medium">{a.iata}</span>
                <span className="truncate">{label(a)}</span>
                {a.country && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {a.country}
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
