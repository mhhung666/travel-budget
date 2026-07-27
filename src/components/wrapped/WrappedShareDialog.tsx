'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Share2, Copy, Check, Loader2, Link2Off, RefreshCw, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMapShareStatus, enableMapShare, disableMapShare } from '@/actions';
import { ROUTES } from '@/constants/routes';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * 年度回顧公開分享控制。**沿用旅行地圖的同一把 `mapShareCode`**（getMapShareStatus /
 * enableMapShare / disableMapShare），連結指向去識別化、不含金額的公開回顧頁
 * （/wrapped/share/[code]/[year]）。因為共用分享碼，文案明確標示這與地圖是同一個開關。
 */
export default function WrappedShareDialog({ year }: { year: number }) {
  const t = useTranslations('wrapped.share');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    code && typeof window !== 'undefined'
      ? `${window.location.origin}${ROUTES.WRAPPED_SHARE(code, year)}`
      : '';

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next) {
      setLoading(true);
      const res = await getMapShareStatus();
      if (res.success) setCode(res.data.code);
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    const res = await enableMapShare();
    if (res.success) setCode(res.data.code);
    else toast({ variant: 'destructive', description: tCommon('error.unknown') });
    setBusy(false);
  };

  const handleRevoke = async () => {
    setBusy(true);
    const res = await disableMapShare();
    if (res.success) setCode(null);
    else toast({ variant: 'destructive', description: tCommon('error.unknown') });
    setBusy(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ description: tCommon('copied') });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy wrapped share link', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { year })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 與地圖共用同一把分享碼的提示 */}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('sameAsMap')}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : code ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="flex-1 bg-muted/40" />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleCopy}
                  aria-label={tCommon('copy')}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('enabledHint')}</p>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleGenerate}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t('regenerate')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={handleRevoke}
                  disabled={busy}
                >
                  <Link2Off className="h-4 w-4" />
                  {t('revoke')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t('disabledHint')}</p>
              <Button className="w-full gap-2" onClick={handleGenerate} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                {t('generate')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
