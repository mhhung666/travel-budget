'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Search } from 'lucide-react';
import { COMMON_CURRENCY_CODES } from '@/constants/currencies';
import {
  currencyOptions,
  normalizeCurrencySearch,
  searchCurrencies,
} from '@/lib/currencySelection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface CurrencySearchPanelProps {
  codes: readonly string[];
  value: string | null;
  onSelect: (code: string) => void;
  onCancel: () => void;
  title?: string;
  disabled?: boolean;
  /** Narrow creation subviews initially focus the heading, leaving the keyboard closed. */
  autoFocusSearch?: boolean;
  /** Narrow panels require explicit keyboard navigation before Enter; a soft Search key only searches. */
  enterSelection?: 'active' | 'navigated';
  layout?: 'popover' | 'sheet';
}

/** Mount for each opening: search resets, while only the controlled value owns the checkmark. */
export function CurrencySearchPanel({
  codes,
  value,
  onSelect,
  onCancel,
  title,
  disabled = false,
  autoFocusSearch = true,
  enterSelection = 'active',
  layout = 'popover',
}: CurrencySearchPanelProps) {
  const t = useTranslations('currencyPicker');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const navigated = useRef(false);
  const [search, setSearch] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(value);
  const options = useMemo(
    () =>
      currencyOptions(
        codes,
        locale,
        Object.fromEntries(COMMON_CURRENCY_CODES.map((code) => [code, t(`names.${code}`)]))
      ),
    [codes, locale, t]
  );
  const results = searchCurrencies(options, search);
  const active = results.find((option) => option.code === activeCode) ?? results[0];
  const activeId = active ? `${id}-${active.code}` : undefined;
  const searching = !!normalizeCurrencySearch(search);
  const groups = searching
    ? [{ label: null, options: results }]
    : [
        { label: t('common'), options: results.filter((option) => option.common) },
        { label: t('other'), options: results.filter((option) => !option.common) },
      ];

  useEffect(() => {
    if (autoFocusSearch) input.current?.focus();
    else heading.current?.focus();
  }, [autoFocusSearch]);
  useEffect(() => {
    if (activeId) {
      const row = document.getElementById(activeId);
      if (row && list.current?.contains(row)) row.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeId, search]);

  const updateSearch = (next: string) => {
    navigated.current = false;
    setSearch(next);
    setActiveCode(searchCurrencies(options, next)[0]?.code ?? null);
  };
  const select = (code: string) => {
    if (!disabled && codes.includes(code)) onSelect(code);
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        layout === 'sheet'
          ? 'h-full'
          : 'max-h-[min(32rem,var(--radix-popover-content-available-height,80dvh))]'
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <h2
          ref={heading}
          id={`${id}-title`}
          tabIndex={-1}
          className="min-w-0 text-base font-semibold"
        >
          {title ?? t('title')}
        </h2>
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-12 shrink-0">
          {tCommon('cancel')}
        </Button>
      </div>
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-4 left-3 size-5" />
          <Input
            ref={input}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-labelledby={`${id}-title`}
            aria-activedescendant={activeId}
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-[52px] pl-10 text-base md:text-base"
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (
                  !composing.current &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229 &&
                  (enterSelection === 'active' || navigated.current) &&
                  active
                )
                  select(active.code);
                return;
              }
              if (composing.current || event.nativeEvent.isComposing) return;
              const index = results.findIndex((option) => option.code === active?.code);
              let next: number;
              switch (event.key) {
                case 'ArrowDown':
                  next = Math.min(index + 1, results.length - 1);
                  break;
                case 'ArrowUp':
                  next = Math.max(index - 1, 0);
                  break;
                case 'Home':
                  next = 0;
                  break;
                case 'End':
                  next = results.length - 1;
                  break;
                default:
                  return;
              }
              event.preventDefault();
              navigated.current = true;
              setActiveCode(results[next]?.code ?? null);
            }}
          />
        </div>
        {!!search && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 whitespace-normal"
            onClick={() => {
              updateSearch('');
              input.current?.focus();
            }}
          >
            {t('clearSearch')}
          </Button>
        )}
      </div>
      <div
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-title`}
        className={cn(
          'min-h-0 overflow-y-auto overscroll-contain p-2',
          layout === 'sheet' ? 'flex-1' : 'max-h-80'
        )}
      >
        {groups.map(
          (group, index) =>
            group.options.length > 0 && (
              <div
                key={group.label ?? 'results'}
                role="group"
                aria-labelledby={group.label ? `${id}-group-${index}` : undefined}
              >
                {group.label && (
                  <div
                    id={`${id}-group-${index}`}
                    className="px-3 pt-3 pb-2 text-sm text-muted-foreground"
                  >
                    {group.label}
                  </div>
                )}
                {group.options.map((option) => (
                  <div
                    id={`${id}-${option.code}`}
                    key={option.code}
                    role="option"
                    aria-selected={value === option.code}
                    aria-disabled={disabled || undefined}
                    onPointerMove={() => !disabled && setActiveCode(option.code)}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => select(option.code)}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-base',
                      value === option.code && 'bg-accent text-accent-foreground',
                      active?.code === option.code && 'outline-2 -outline-offset-2 outline-ring',
                      disabled && 'cursor-default opacity-50'
                    )}
                  >
                    <span className="shrink-0 font-medium">{option.code}</span>
                    <span className="min-w-0 flex-1 break-words">
                      {option.label !== option.code ? option.label : null}
                    </span>
                    {value === option.code && (
                      <Check aria-hidden="true" className="size-5 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )
        )}
      </div>
      {!results.length && (
        <div role="status" className="space-y-2 p-4 text-sm">
          <p>{t('noMatch')}</p>
          <p className="text-muted-foreground">{t('searchHint')}</p>
        </div>
      )}
    </div>
  );
}

interface CurrencyPickerProps extends Omit<CurrencySearchPanelProps, 'onCancel'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Popover shell; narrow creation can mount the same panel inside its existing sheet. */
export function CurrencyPicker({
  open,
  onOpenChange,
  trigger,
  onSelect,
  onCloseAutoFocus,
  ...panel
}: CurrencyPickerProps) {
  const t = useTranslations('currencyPicker');
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={panel.title ?? t('title')}
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (event.isComposing || event.keyCode === 229) event.preventDefault();
        }}
      >
        <CurrencySearchPanel
          {...panel}
          onCancel={() => onOpenChange(false)}
          onSelect={(code) => {
            onSelect(code);
            onOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
