import { headObject } from '@/lib/storage';
import { isItineraryKeyForTrip, ITINERARY_CONTENT_TYPES, MAX_ITINERARY_BYTES } from '@/lib/uploads';

export type AttachmentDoc = {
  key: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
};

/** Per action invocation, shared across all activities in the submitted day. */
export const ITINERARY_HEAD_CONCURRENCY = 4;

/** Validate unique new keys before a transaction; keep existing metadata unchanged. */
export async function resolveItineraryAttachments(
  tripId: string,
  uploaderId: string,
  inputs: { key: string }[],
  existingByKey: Map<string, AttachmentDoc>
): Promise<Map<string, AttachmentDoc> | null> {
  const keys = [...new Set(inputs.map(({ key }) => key))];
  const newKeys = keys.filter((key) => !existingByKey.has(key));
  if (newKeys.some((key) => !isItineraryKeyForTrip(tripId, key))) return null;
  const resolved = new Map(existingByKey);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < newKeys.length) {
      const key = newKeys[next++];
      try {
        const head = await headObject('receipts', key);
        if (
          !head ||
          head.size > MAX_ITINERARY_BYTES ||
          !(ITINERARY_CONTENT_TYPES as readonly string[]).includes(head.contentType)
        ) {
          failed = true;
          return;
        }
        resolved.set(key, { key, ...head, uploadedBy: uploaderId, uploadedAt: new Date() });
      } catch {
        failed = true;
      }
    }
  }
  // Drain already-started requests even on failure; never leave detached HEAD work.
  await Promise.all(
    Array.from({ length: Math.min(ITINERARY_HEAD_CONCURRENCY, newKeys.length) }, worker)
  );
  return failed ? null : resolved;
}
