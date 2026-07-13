'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronsUpDown, Hotel, X } from 'lucide-react';

import {
  HOTEL_BRANDS,
  getHotelBrand,
  getHotelBrandName,
  getHotelGroup,
  getHotelGroupName,
} from '@/constants/hotelBrands';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface BrandComboboxProps {
  /** 品牌目錄 id；null＝獨立旅宿/無品牌。 */
  value: string | null;
  onChange: (brandId: string | null) => void;
  disabled?: boolean;
}

/**
 * 可搜尋的飯店品牌選擇器（精選目錄 src/constants/hotelBrands.ts）。
 * 品牌為可選欄位——目錄缺漏不擋輸入，選不到就留空（獨立旅宿）。
 */
export function BrandCombobox({ value, onChange, disabled }: BrandComboboxProps) {
  const t = useTranslations('collections');
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const selected = getHotelBrand(value);

  const options = useMemo(
    () =>
      HOTEL_BRANDS.map((b) => {
        const group = getHotelGroup(b.group);
        return {
          brand: b,
          label: getHotelBrandName(b, locale),
          groupLabel: group ? getHotelGroupName(group, locale) : '',
        };
      }),
    [locale]
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
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{getHotelBrandName(selected, locale)}</span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Hotel className="h-4 w-4" />
              {t('stays.noBrand')}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
          }
        >
          <CommandInput placeholder={t('stays.searchBrand')} />
          <CommandList>
            {value && (
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {t('stays.noBrand')}
              </CommandItem>
            )}
            <CommandEmpty>{t('common.noMatch')}</CommandEmpty>
            {options.map(({ brand, label, groupLabel }) => (
              <CommandItem
                key={brand.id}
                value={`${brand.name} ${brand.nameZh ?? ''} ${groupLabel}`}
                onSelect={() => {
                  onChange(brand.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{label}</span>
                {groupLabel && groupLabel !== label && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {groupLabel}
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
