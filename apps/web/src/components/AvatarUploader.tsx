'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, Trash2 } from 'lucide-react';
import { createAvatarUploadUrl, setAvatar, removeAvatar } from '@/actions';
import { compressImage } from '@/lib/imageCompress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * 頭像上傳/移除（設定頁）。選檔 → client 壓縮成 512px WebP → presigned PUT 直傳公開
 * avatars bucket → setAvatar 寫入並回傳公開 URL → 透過 onChange 通知上層更新預覽。
 */
export default function AvatarUploader({
  displayName,
  avatarUrl,
  onChange,
}: {
  displayName: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const t = useTranslations('settings.avatar');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const compressed = await compressImage(file, 'avatar');
      const ticket = await createAvatarUploadUrl(compressed.type, compressed.size);
      if (!ticket.success) throw new Error();
      const put = await fetch(ticket.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': compressed.type },
        body: compressed,
      });
      if (!put.ok) throw new Error();
      const saved = await setAvatar(ticket.data.key);
      if (!saved.success) throw new Error();
      onChange(saved.data.avatar_url);
    } catch {
      setError(t('uploadFailed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await removeAvatar();
      if (!res.success) throw new Error();
      onChange(null);
    } catch {
      setError(t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        <AvatarImage src={avatarUrl ?? ''} alt={displayName} />
        <AvatarFallback className="bg-primary text-primary-foreground text-xl">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {t('change')}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('remove')}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
