'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Share2, Copy, Check, Loader2, Link2Off, RefreshCw } from 'lucide-react';
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
import { getAlbumShareStatus, enableAlbumShare, disableAlbumShare } from '@/actions';
import { ROUTES } from '@/constants/routes';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

/**
 * 相簿公開分享控制（PLAN-PHOTOS Phase 4）：產生 / 重新產生 / 撤銷連結並複製。
 * 比照 MapShareDialog，但**trip-scoped**（吃 tripId，呼叫的 action 先驗成員）。
 * 連結指向純相片牌的唯讀公開頁（/album/share/[code]），不含任何位置資訊。
 */
export default function AlbumShareDialog({ tripId }: { tripId: string }) {
  const t = useTranslations('album.share');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    code && typeof window !== 'undefined'
      ? `${window.location.origin}${ROUTES.ALBUM_SHARE(code)}`
      : '';

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next) {
      setLoading(true);
      const res = await getAlbumShareStatus(tripId);
      if (res.success) setCode(res.data.code);
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    const res = await enableAlbumShare(tripId);
    if (res.success) setCode(res.data.code);
    else toast({ variant: 'destructive', description: tCommon('error.unknown') });
    setBusy(false);
  };

  const handleRevoke = async () => {
    setBusy(true);
    const res = await disableAlbumShare(tripId);
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
      logger.error('Failed to copy album share link', err);
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
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
