'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Loader2, ChevronsUpDown, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { logger } from '@/lib/logger';

// Nominatim API 回傳的地點資料
interface NominatimPlace {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
  // namedetails=1 回傳的各語言 OSM name 標籤，如 name:en / name:ja / name:zh-Hant
  namedetails?: Record<string, string>;
  boundingbox: string[];
}

// 組件內部使用的地點格式
export interface LocationOption {
  name: string;
  names?: Record<string, string>;
  display_name: string;
  lat: number;
  lon: number;
  country?: string;
  country_code?: string;
}

// 從 Nominatim namedetails 抓出各 app locale 的在地化地名。
// OSM 的中文標籤不一定齊全，繁/簡缺值時退回通用的 name:zh。
// 缺的語言不放進表，顯示端再 fallback 到 name 本身。
function buildLocalizedNames(
  namedetails: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!namedetails) return undefined;
  const names: Record<string, string> = {};
  const en = namedetails['name:en'];
  const ja = namedetails['name:ja'];
  const zhHant = namedetails['name:zh-Hant'] ?? namedetails['name:zh'];
  const zhHans = namedetails['name:zh-Hans'] ?? namedetails['name:zh'];
  if (en) names.en = en;
  if (ja) names.jp = ja;
  if (zhHant) names.zh = zhHant;
  if (zhHans) names['zh-CN'] = zhHans;
  return Object.keys(names).length > 0 ? names : undefined;
}

// 將 app 的 next-intl locale 對應到 Nominatim 的 accept-language。
// 帶上 fallback 鏈：偏好的書寫系統優先，缺值時逐步退化到 en，
// 避免 OSM 沒有對應標籤時直接掉成空白。
const LOCALE_TO_ACCEPT_LANGUAGE: Record<string, string> = {
  zh: 'zh-Hant,zh-TW,zh,en', // 繁體優先
  'zh-CN': 'zh-Hans,zh-CN,zh,en', // 簡體優先
  jp: 'ja,en',
  en: 'en',
};

function acceptLanguageFor(locale: string): string {
  return LOCALE_TO_ACCEPT_LANGUAGE[locale] ?? 'en';
}

interface LocationAutocompleteProps {
  value: LocationOption | null;
  onChange: (location: LocationOption | null) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
  disabled?: boolean;
}

export default function LocationAutocomplete({
  value,
  onChange,
  label,
  placeholder,
  helperText,
  error = false,
  disabled = false,
}: LocationAutocompleteProps) {
  const locale = useLocale();
  const t = useTranslations('location');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 使用 Nominatim API 搜尋地點
  const searchLocations = async (searchQuery: string): Promise<LocationOption[]> => {
    if (!searchQuery || searchQuery.length < 2) {
      return [];
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({
            q: searchQuery,
            format: 'json',
            addressdetails: '1',
            namedetails: '1', // 一併取得各語言地名，建立時存下供之後在地化顯示
            limit: '5',
            'accept-language': acceptLanguageFor(locale), // 跟著 app 當前語言
          }),
        {
          headers: {
            'User-Agent': 'TravelBudget/1.0', // Nominatim 要求提供 User-Agent
          },
        }
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: NominatimPlace[] = await response.json();

      return data.map((place) => {
        // 取得地點的簡短名稱
        const name =
          place.address.city ||
          place.address.town ||
          place.address.village ||
          place.address.state ||
          place.display_name.split(',')[0];

        return {
          name,
          names: buildLocalizedNames(place.namedetails),
          display_name: place.display_name,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
          country: place.address.country,
          country_code: place.address.country_code?.toUpperCase(),
        };
      });
    } catch (error) {
      logger.error('Location search error', error);
      return [];
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setLoading(true);
        const results = await searchLocations(query);
        setOptions(results);
        setLoading(false);
      } else {
        setOptions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
    // 包含 locale：切換語言時用新語言重新搜尋
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, locale]);

  return (
    <div className="grid gap-2">
      {label && <Label className={error ? 'text-destructive' : ''}>{label}</Label>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between bg-background px-3 font-normal',
              !value && 'text-muted-foreground',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
            disabled={disabled}
          >
            {value ? (
              <span className="truncate">{value.name}</span>
            ) : (
              placeholder || t('selectPlaceholder')
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t('searchPlaceholder')}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('searching')}
                </div>
              )}

              {!loading && options.length === 0 && query.length >= 2 && (
                <CommandEmpty>{t('noResults')}</CommandEmpty>
              )}

              {!loading && options.length === 0 && query.length < 2 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('minChars')}
                </div>
              )}

              {!loading &&
                options.map((option) => (
                  <CommandItem
                    key={`${option.lat}-${option.lon}`}
                    value={`${option.name} ${option.display_name}`}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                      setQuery(''); // Reset query? Or keep it? Usually reset.
                    }}
                  >
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground shrink-0 mt-0.5 self-start" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium">{option.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {option.display_name}
                      </span>
                    </div>
                    {value?.lat === option.lat && value?.lon === option.lon && (
                      <Check className="ml-auto h-4 w-4 opacity-100 shrink-0" />
                    )}
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {helperText && (
        <p className={cn('text-[0.8rem] text-muted-foreground', error && 'text-destructive')}>
          {helperText}
        </p>
      )}
    </div>
  );
}
