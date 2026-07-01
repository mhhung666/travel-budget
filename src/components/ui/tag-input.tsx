'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 30;

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 建議清單（例如同 trip 內其他支出已用過的標籤），依輸入內容即時過濾。 */
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * 自由文字的標籤輸入（chip）：輸入後按 Enter / 逗號成立一個 chip，點 x 移除；
 * 下拉建議來自 `suggestions`（過濾掉已選的、比對已輸入的前綴，大小寫不敏感）。
 * 數量/長度上限與 `tagSchema`（見 lib/validation.ts）一致，避免送出會被伺服器拒絕的值。
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  disabled = false,
  id,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const tag = raw.trim();
    if (!tag || tag.length > MAX_TAG_LENGTH || value.length >= MAX_TAGS) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const filteredSuggestions = suggestions
    .filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()))
    .filter((s) => draft.trim() === '' || s.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 8);

  const open = !disabled && filteredSuggestions.length > 0 && draft.trim() !== '';

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {value.map((tag, index) => (
            <Badge key={tag} variant="secondary" className="gap-1 font-normal">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  className="rounded-full hover:bg-muted-foreground/20"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          <input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit(draft);
              } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
                removeAt(value.length - 1);
              }
            }}
            placeholder={value.length === 0 ? placeholder : ''}
            disabled={disabled}
            className="flex-1 min-w-[6rem] border-none bg-transparent p-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
