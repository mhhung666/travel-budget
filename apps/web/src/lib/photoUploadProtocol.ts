import { z } from 'zod';
import { addPhotosSchema } from './validation';
import { MAX_PHOTO_BYTES } from './uploads';
import type { TripPhoto } from '@/types';

import { MAX_PHOTO_SOURCE_BYTES } from './photoUploadLimits';
export const photoHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const photoUploadIdSchema = z.string().uuid();
export const beginPhotoUploadSchema = z.object({
  uploadId: photoUploadIdSchema,
  sourceHash: photoHashSchema,
  sourceSize: z.number().int().positive().max(MAX_PHOTO_SOURCE_BYTES),
  displaySize: z.number().int().positive().max(MAX_PHOTO_BYTES),
  thumbSize: z.number().int().positive().max(MAX_PHOTO_BYTES),
  // Keys are assigned by the server; only the validated metadata is retained.
  item: addPhotosSchema.shape.items.element,
});
export type BeginPhotoUploadInput = z.infer<typeof beginPhotoUploadSchema>;
export type PhotoUploadOutcome = { status: 'saved' | 'duplicate'; photo: TripPhoto };
export type PhotoUploadReply =
  | PhotoUploadOutcome
  | { status: 'pending'; displayUrl?: string; thumbUrl?: string }
  | { status: 'expired' | 'missing' | 'full' | 'deleted' };
