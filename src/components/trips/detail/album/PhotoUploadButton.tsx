'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  runPhotoUploadQueue,
  type PhotoUploadTask,
  type PhotoUploadFailure,
} from '@/lib/photoUpload';
import type { TripPhoto } from '@/types';
import { PHOTO_LIMIT_PER_TRIP } from '@/lib/validation';
import { Button } from '@/components/ui/button';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const FAILURE_MESSAGE_KEY: Record<PhotoUploadFailure, string> = {
  'too-large': 'uploadTooLarge',
  unsupported: 'uploadUnsupported',
  failed: 'uploadFailed',
  full: 'uploadFull',
  access: 'uploadAccessLost',
};

/** Mounted once above the empty/grid branches so the first saved photo cannot reset the queue. */
export function PhotoUploadButton({
  tripId,
  photoCount,
  onPhoto,
  onView,
  onFinished,
}: {
  tripId: string;
  photoCount: number;
  onPhoto: (photo: TripPhoto) => void;
  onView: (photoId: string) => void;
  onFinished: () => void;
}) {
  const t = useTranslations('album');
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [tasks, setTasks] = useState<PhotoUploadTask[]>([]);
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({ onPhoto, onFinished });
  useEffect(() => {
    callbacks.current = { onPhoto, onFinished };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const run = async (selected: PhotoUploadTask[]) => {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      await runPhotoUploadQueue(selected, {
        tripId,
        signal: abort.signal,
        onChange: (task) => {
          if (mounted.current)
            setTasks((current) => current.map((old) => (old.id === task.id ? task : old)));
        },
        onPhoto: (photo) => {
          if (mounted.current) callbacks.current.onPhoto(photo);
        },
      });
    } finally {
      controller.current = null;
      if (mounted.current) {
        setBusy(false);
        callbacks.current.onFinished();
      }
    }
  };
  const handleFiles = (files: FileList | null) => {
    if (!files?.length || controller.current) return;
    const selected = Array.from(
      files,
      (file): PhotoUploadTask => ({ id: crypto.randomUUID(), file, stage: 'waiting' })
    );
    setTasks(selected);
    if (inputRef.current) inputRef.current.value = '';
    void run(selected);
  };
  const retryable = tasks.filter((task) => task.stage === 'failed' || task.stage === 'canceled');
  const saved = tasks.filter((task) => task.stage === 'saved').length;
  const duplicate = tasks.filter((task) => task.stage === 'duplicate').length;
  const canceled = tasks.filter((task) => task.stage === 'canceled').length;
  const failed = tasks.filter((task) => task.stage === 'failed').length;
  const done = saved + duplicate + canceled + failed;

  return (
    <section className="mb-4 space-y-3" aria-label={t('upload')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {t('upload')}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t('uploadRemaining', { count: Math.max(0, PHOTO_LIMIT_PER_TRIP - photoCount) })}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          aria-label={t('upload')}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {tasks.length > 0 && (
        <div className="space-y-3 rounded-lg border p-3">
          <p role="status" aria-live="polite" className="text-sm">
            {t(busy ? 'uploadProgress' : 'uploadComplete', { done, total: tasks.length })}
            {' · '}
            {t('uploadSummary', { saved, duplicate, failed, canceled })}
          </p>
          <progress
            className="h-2 w-full"
            value={done}
            max={tasks.length}
            aria-label={t('upload')}
          />
          <details open={busy || retryable.length > 0}>
            <summary className="cursor-pointer text-sm">{t('uploadDetails')}</summary>
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  {task.photo && (
                    <Image
                      unoptimized
                      src={task.photo.thumb_url}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate" title={task.file.name}>
                      {task.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`uploadStages.${task.stage}`)}
                      {task.reason && ` · ${t(FAILURE_MESSAGE_KEY[task.reason])}`}
                    </p>
                    {task.photo && (
                      <p className="text-xs text-muted-foreground">
                        {task.photo.uploaded_by_name} ·{' '}
                        {new Date(task.photo.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {task.photo && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onView(task.photo!.id)}
                    >
                      {t(task.stage === 'duplicate' ? 'uploadViewExisting' : 'uploadView')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            {busy && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => controller.current?.abort()}
              >
                {t('uploadStop')}
              </Button>
            )}
            {!busy && retryable.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => void run(retryable)}>
                {t('uploadRetry')}
              </Button>
            )}
            {!busy && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setTasks([])}>
                {t('uploadDismiss')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('uploadDedupHint')}</p>
        </div>
      )}
    </section>
  );
}
