'use client';

import { useLayoutEffect, useRef } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface ResponsiveFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** 無障礙描述（畫面上隱藏）。 */
  description?: string;
  /**
   * 底部動作列（通常是送出鍵）。表單本體與 footer 分屬不同容器，
   * 送出鍵請用 `<Button form="表單 id" type="submit">` 綁回表單。
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** 桌機 Dialog 寬度覆寫（預設 sm:max-w-[600px]）。 */
  desktopClassName?: string;
  /** Replaces the view inside the same modal; keeps the underlying form and scroll position. */
  subview?: { title: React.ReactNode; content: React.ReactNode };
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * 表單容器的響應式雙形態（UI/UX 重設計 5.3）：
 * - 桌機（md+）：置中 Dialog，內容區可捲動、footer 常駐。
 * - 行動端：全螢幕 Sheet 由下滑入 —— 鍵盤彈出時 100dvh 隨可視區收縮，
 *   sticky footer 的送出鍵不會被鍵盤蓋掉（置中 Dialog 的老問題）。
 */
export function ResponsiveFormSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  desktopClassName,
  subview,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: ResponsiveFormSheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const body = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const showingSubview = !!subview;
  useLayoutEffect(() => {
    if (!showingSubview && body.current) body.current.scrollTop = scrollTop.current;
  }, [showingSubview, isDesktop, open]);
  const content = (
    <>
      <div
        ref={body}
        hidden={showingSubview}
        inert={showingSubview || undefined}
        aria-hidden={showingSubview || undefined}
        className={cn('min-h-0 flex-1 overflow-y-auto py-4', isDesktop ? 'px-6' : 'px-4')}
        onScroll={(event) => {
          if (!showingSubview) scrollTop.current = event.currentTarget.scrollTop;
        }}
      >
        {children}
      </div>
      {subview && (
        <div className="min-h-0 flex-1 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          {subview.content}
        </div>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[600px]',
            showingSubview && '[&>button]:hidden',
            desktopClassName
          )}
        >
          <DialogHeader className={showingSubview ? 'sr-only' : 'border-b px-6 py-4 pr-14'}>
            <DialogTitle>{subview?.title ?? title}</DialogTitle>
            {description && (
              <DialogDescription className="sr-only">{description}</DialogDescription>
            )}
          </DialogHeader>
          {content}
          {!showingSubview && footer && (
            <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">{footer}</DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        side="bottom"
        className={cn(
          'flex h-[100dvh] flex-col gap-0 rounded-none border-t-0 p-0',
          showingSubview && '[&>button]:hidden'
        )}
      >
        <SheetHeader
          className={
            showingSubview
              ? 'sr-only'
              : 'border-b px-4 pr-14 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-left'
          }
        >
          <SheetTitle>{subview?.title ?? title}</SheetTitle>
          {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
        </SheetHeader>
        {content}
        {!showingSubview && footer && (
          <div className="border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
