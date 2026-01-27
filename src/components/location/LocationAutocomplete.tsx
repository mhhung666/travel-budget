'use client';

import { useState, useEffect, useRef } from 'react';
import {
  TextField,
  Autocomplete,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { MapPin } from 'lucide-react';

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
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 使用 Nominatim API 搜尋地點
  const searchLocations = async (query: string): Promise<LocationOption[]> => {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
          q: query,
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

  // Debounced search - 使用 useRef 來追蹤 timeout
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 當輸入改變時搜尋（帶有 debounce）
  useEffect(() => {
    // 清除之前的 timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (inputValue.length >= 2) {
      setLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchLocations(inputValue);
        setOptions(results);
        setLoading(false);
      }, 300);
    } else {
      setOptions([]);
      setLoading(false);
    }

    // 清理
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [inputValue]);

  return (
    <Autocomplete
      value={value}
      onChange={(_, newValue) => {
        onChange(newValue);
      }}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => {
        setInputValue(newInputValue);
      }}
      options={options}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(option) => option.display_name}
      isOptionEqualToValue={(option, val) =>
        option.lat === val.lat && option.lon === val.lon
      }
      filterOptions={(x) => x} // 不做本地過濾，由 API 處理
      noOptionsText={inputValue.length < 2 ? '請輸入至少 2 個字元' : '找不到地點'}
      loadingText="搜尋中..."
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          error={error}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <Box
            component="li"
            key={`${option.lat}-${option.lon}`}
            {...rest}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}
          >
            <MapPin size={20} style={{ marginTop: 4 }} className="text-gray-500" />
            <Box>
              <Typography variant="body1">{option.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                {option.display_name}
              </Typography>
              {option.country && (
                <Typography variant="caption" color="primary">
                  {option.country}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
    />
  );
}
