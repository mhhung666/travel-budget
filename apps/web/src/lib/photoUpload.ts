'use client';

import { compressImage } from '@/lib/imageCompress';
import { readPhotoExif } from '@/lib/exif';
import {
  beginPhotoUpload,
  finishPhotoUpload,
  findDuplicatePhoto,
} from '@/actions/photoUpload.actions';
import type { ActionResult } from '@/actions/types';
import type { PhotoUploadOutcome, PhotoUploadReply } from './photoUploadProtocol';
import { MAX_PHOTO_SOURCE_BYTES } from './photoUploadLimits';
import type { TripPhoto } from '@/types';
export { MAX_PHOTO_SOURCE_BYTES } from './photoUploadLimits';

const UPLOAD_CONCURRENCY = 3;
export type PhotoUploadFailure = 'too-large' | 'unsupported' | 'failed' | 'full' | 'access';
export type PhotoUploadStage =
  | 'waiting'
  | 'checking'
  | 'compressing'
  | 'uploading'
  | 'saving'
  | 'confirming'
  | 'saved'
  | 'duplicate'
  | 'failed'
  | 'canceled';
export interface PhotoUploadTask {
  id: string;
  file: File;
  stage: PhotoUploadStage;
  uploadId?: string;
  sourceHash?: string;
  reason?: PhotoUploadFailure;
  photo?: TripPhoto;
}

class UploadError extends Error {
  constructor(readonly reason: PhotoUploadFailure) {
    super(reason);
  }
}
function unwrap<T>(result: ActionResult<T>): T {
  if (result.success) return result.data;
  throw new UploadError(
    ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED'].includes(result.code ?? '') ? 'access' : 'failed'
  );
}
function outcome(reply: PhotoUploadReply): PhotoUploadOutcome | undefined {
  if (reply.status === 'saved' || reply.status === 'duplicate') return reply;
  if (reply.status === 'full') throw new UploadError('full');
  if (reply.status === 'deleted') throw new UploadError('failed');
}
async function measure(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}
async function hash(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function put(url: string | undefined, file: File, signal: AbortSignal) {
  if (!url) return; // Already verified on R2: never resend a successful half on retry.
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
    signal: AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) throw new UploadError('failed');
}

/** Each worker owns one file through DB confirmation. Errors cannot discard another worker's
 * success. Retrying keeps uploadId, even when the previous server response was lost. */
export async function runPhotoUploadQueue(
  tasks: PhotoUploadTask[],
  options: {
    tripId: string;
    signal: AbortSignal;
    onChange: (task: PhotoUploadTask) => void;
    onPhoto: (photo: TripPhoto) => void;
  }
) {
  const { signal, tripId } = options;
  let next = 0;
  let stopReason: PhotoUploadFailure | undefined;
  // Same-selection followers await the first copy instead of compressing/uploading it again.
  const inFlight = new Map<string, Promise<TripPhoto | undefined>>();
  const update = (task: PhotoUploadTask, patch: Partial<PhotoUploadTask>) => {
    Object.assign(task, patch);
    options.onChange({ ...task });
  };
  const complete = (task: PhotoUploadTask, result: PhotoUploadOutcome) => {
    update(task, { stage: result.status, photo: result.photo, reason: undefined });
    options.onPhoto(result.photo);
  };
  const checkCanceled = () => {
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
  };

  const process = async (task: PhotoUploadTask) => {
    let release: ((photo: TripPhoto | undefined) => void) | undefined;
    try {
      update(task, { stage: 'checking', reason: undefined });
      checkCanceled();
      if (task.file.size > MAX_PHOTO_SOURCE_BYTES) throw new UploadError('too-large');
      // Resolve a previous operation BEFORE compression or allocation of another UUID.
      if (task.uploadId) {
        update(task, { stage: 'confirming' });
        const previous = unwrap(await finishPhotoUpload(tripId, task.uploadId));
        const done = outcome(previous);
        if (done) {
          complete(task, done);
          return;
        }
        if (previous.status === 'expired' || previous.status === 'missing')
          task.uploadId = undefined;
      }
      checkCanceled();
      task.sourceHash ??= await hash(task.file);
      const earlier = inFlight.get(task.sourceHash);
      if (earlier) {
        const photo = await earlier;
        if (photo) {
          complete(task, { status: 'duplicate', photo });
          return;
        }
      }
      checkCanceled();
      inFlight.set(
        task.sourceHash,
        new Promise((resolve) => {
          release = resolve;
        })
      );
      const existing = unwrap(await findDuplicatePhoto(tripId, task.sourceHash));
      if (existing) {
        complete(task, { status: 'duplicate', photo: existing });
        return;
      }
      checkCanceled();
      update(task, { stage: 'compressing' });
      const exif = await readPhotoExif(task.file);
      const display = await compressImage(task.file, 'photo');
      checkCanceled();
      const thumb = await compressImage(task.file, 'photoThumb');
      if (display === task.file || thumb === task.file) throw new UploadError('unsupported');
      const dimensions = await measure(display);
      checkCanceled();
      task.uploadId ??= crypto.randomUUID();
      const ticket = unwrap(
        await beginPhotoUpload(tripId, {
          uploadId: task.uploadId,
          sourceHash: task.sourceHash,
          sourceSize: task.file.size,
          displaySize: display.size,
          thumbSize: thumb.size,
          item: { key: 'server-assigned', thumb_key: 'server-assigned', ...dimensions, ...exif },
        })
      );
      const done = outcome(ticket);
      if (done) {
        complete(task, done);
        return;
      }
      if (ticket.status !== 'pending') throw new UploadError('failed');
      checkCanceled();
      update(task, { stage: 'uploading' });
      // Wait for both requests to settle before reconciling a lost response.
      const puts = await Promise.allSettled([
        put(ticket.displayUrl, display, signal),
        put(ticket.thumbUrl, thumb, signal),
      ]);
      update(task, { stage: puts.some((p) => p.status === 'rejected') ? 'confirming' : 'saving' });
      const saved = outcome(unwrap(await finishPhotoUpload(tripId, task.uploadId)));
      if (!saved) throw new UploadError('failed');
      complete(task, saved);
    } catch (error) {
      // One bounded reconciliation, including aborted fetches: an abort does not undo a PUT/commit.
      if (task.uploadId) {
        update(task, { stage: 'confirming' });
        try {
          const recovered = outcome(unwrap(await finishPhotoUpload(tripId, task.uploadId)));
          if (recovered) {
            complete(task, recovered);
            return;
          }
        } catch {
          /* Preserve the original failure; manual retry uses the same uploadId. */
        }
      }
      const reason = error instanceof UploadError ? error.reason : 'failed';
      if (reason === 'full' || reason === 'access') stopReason = reason;
      update(task, { stage: signal.aborted ? 'canceled' : 'failed', reason });
    } finally {
      release?.(task.photo);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, tasks.length) }, async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        if (signal.aborted || stopReason) {
          update(task, { stage: signal.aborted ? 'canceled' : 'failed', reason: stopReason });
        } else await process(task);
      }
    })
  );
}
