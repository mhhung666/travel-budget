'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronsUpDown, Plus } from 'lucide-react';

import { getAllCurrencyCodes, getCurrencyLabel } from '@/constants/currencies';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CurrencyComboboxProps {
  /** 已加入的幣別代碼（會從候選中排除，避免重複加入）。 */
  excluded: string[];
  /** 使用者選定一個幣別代碼。 */
  onSelect: (code: string) => void;
  disabled?: boolean;
}

/**
 * 可搜尋的幣別選擇器（全 ISO 4217，非精選 6 種）。以代碼或本地化名稱搜尋，
 * 選定後透過 onSelect 回拋、供設定頁把幣別加入常用清單。
 */
export default function CurrencyCombobox({ excluded, onSelect, disabled }: CurrencyComboboxProps) {
  const t = useTranslations('trip');
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const options = useMemo(
    () =>
      getAllCurrencyCodes()
        .filter((code) => !excludedSet.has(code))
        .map((code) => ({ code, label: getCurrencyLabel(code, locale) })),
    [excludedSet, locale]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between sm:w-72"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            {t('currencySettings.addCurrency')}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(value, search) => {
            // value = "CODE label"；代碼或名稱任一命中即顯示
            return value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={t('currencySettings.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('currencySettings.noMatch')}</CommandEmpty>
            {options.map(({ code, label }) => (
              <CommandItem
                key={code}
                value={`${code} ${label}`}
                onSelect={() => {
                  onSelect(code);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{code}</span>
                <span className="ml-2 text-muted-foreground">{label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
