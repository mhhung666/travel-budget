'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, ChevronsUpDown, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';

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
  boundingbox: string[];
}

// 組件內部使用的地點格式
export interface LocationOption {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  country?: string;
  country_code?: string;
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
          limit: '5',
          'accept-language': 'zh-TW,en', // 優先使用繁體中文
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
          display_name: place.display_name,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
          country: place.address.country,
          country_code: place.address.country_code?.toUpperCase(),
        };
      });
    } catch (error) {
      console.error('Location search error:', error);
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
  }, [query]);

  return (
    <div className="grid gap-2">
      {label && <Label className={error ? "text-destructive" : ""}>{label}</Label>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between bg-background px-3 font-normal",
              !value && "text-muted-foreground",
              error && "border-destructive focus-visible:ring-destructive"
            )}
            disabled={disabled}
          >
            {value ? (
              <span className="truncate">{value.name}</span>
            ) : (
              placeholder || "Select location..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search location..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}

              {!loading && options.length === 0 && query.length >= 2 && (
                <CommandEmpty>No location found.</CommandEmpty>
              )}

              {!loading && options.length === 0 && query.length < 2 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Please enter at least 2 characters.
                </div>
              )}

              {!loading && options.map((option) => (
                <CommandItem
                  key={`${option.lat}-${option.lon}`}
                  value={`${option.name} ${option.display_name}`}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                    setQuery(""); // Reset query? Or keep it? Usually reset.
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
        <p className={cn("text-[0.8rem] text-muted-foreground", error && "text-destructive")}>
          {helperText}
        </p>
      )}
    </div>
  );
}
