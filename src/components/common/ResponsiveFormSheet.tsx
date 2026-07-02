'use client';

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
}: ResponsiveFormSheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn('flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[600px]', desktopClassName)}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription className="hidden">{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">{footer}</DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col gap-0 rounded-none border-t-0 p-0"
      >
        <SheetHeader className="border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-left">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription className="hidden">{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
