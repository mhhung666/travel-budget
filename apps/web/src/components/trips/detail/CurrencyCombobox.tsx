'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { getAllCurrencyCodes } from '@/constants/currencies';
import { Button } from '@/components/ui/button';
import { CurrencyPicker } from '@/components/trips/CurrencyPicker';

interface CurrencyComboboxProps {
  excluded: string[];
  onSelect: (code: string) => void;
  disabled?: boolean;
}

/** Add-to-favourites adapter: candidate source and callback semantics stay unchanged. */
export default function CurrencyCombobox({ excluded, onSelect, disabled }: CurrencyComboboxProps) {
  const t = useTranslations('trip');
  const [open, setOpen] = useState(false);
  const codes = useMemo(() => {
    const excludedSet = new Set(excluded);
    return getAllCurrencyCodes().filter((code) => !excludedSet.has(code));
  }, [excluded]);

  return (
    <CurrencyPicker
      open={open}
      onOpenChange={setOpen}
      codes={codes}
      value={null}
      onSelect={onSelect}
      disabled={disabled}
      trigger={
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-[52px] w-full justify-between whitespace-normal sm:w-72"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t('currencySettings.addCurrency')}
          </span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    />
  );
}
