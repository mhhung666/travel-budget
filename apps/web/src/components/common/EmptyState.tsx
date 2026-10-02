'use client';

import type { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** 可選的 CTA(例如「新增一筆」按鈕),置中顯示在文案下方。 */
  action?: ReactNode;
  className?: string;
}

/**
 * 通用空狀態:icon 圓底 + 標題 + 說明 + 可選 CTA。
 * 全站空狀態統一長相(設計原則 3);在卡片內使用時可用
 * `className="border-0 bg-transparent"` 去掉虛線框。
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed bg-muted/30 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
