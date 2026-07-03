import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  extForContentType,
  buildObjectKey,
  receiptKeyPrefix,
  isReceiptKeyForTrip,
  itineraryKeyPrefix,
  isItineraryKeyForTrip,
  noteKeyPrefix,
  isNoteKeyForTrip,
  avatarKeyPrefix,
  isAvatarKeyForUser,
  MAX_RECEIPT_BYTES,
  MAX_AVATAR_BYTES,
  MAX_ITINERARY_BYTES,
  MAX_NOTE_BYTES,
} from '@/lib/uploads';

describe('validateUpload', () => {
  it('accepts an allowed receipt image within the size cap', () => {
    expect(validateUpload('receipt', 'image/webp', 500_000)).toEqual({ ok: true });
  });

  it('accepts a PDF receipt but rejects a PDF avatar', () => {
    expect(validateUpload('receipt', 'application/pdf', 1_000)).toEqual({ ok: true });
    expect(validateUpload('avatar', 'application/pdf', 1_000)).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('treats itinerary tickets like receipts (images + PDF, same cap)', () => {
    expect(validateUpload('itinerary', 'application/pdf', 1_000)).toEqual({ ok: true });
    expect(validateUpload('itinerary', 'image/webp', 500_000)).toEqual({ ok: true });
    expect(validateUpload('itinerary', 'image/gif', 1_000)).toEqual({ ok: false, reason: 'type' });
    expect(validateUpload('itinerary', 'image/png', MAX_ITINERARY_BYTES + 1)).toEqual({
      ok: false,
      reason: 'size',
    });
  });

  it('rejects a disallowed content type', () => {
    expect(validateUpload('receipt', 'image/gif', 1_000)).toEqual({ ok: false, reason: 'type' });
    expect(validateUpload('avatar', 'image/svg+xml', 1_000)).toEqual({ ok: false, reason: 'type' });
  });

  it('rejects non-positive, NaN, and over-cap sizes', () => {
    expect(validateUpload('receipt', 'image/png', 0)).toEqual({ ok: false, reason: 'size' });
    expect(validateUpload('receipt', 'image/png', -1)).toEqual({ ok: false, reason: 'size' });
    expect(validateUpload('receipt', 'image/png', NaN)).toEqual({ ok: false, reason: 'size' });
    expect(validateUpload('receipt', 'image/png', MAX_RECEIPT_BYTES + 1)).toEqual({
      ok: false,
      reason: 'size',
    });
    expect(validateUpload('avatar', 'image/png', MAX_AVATAR_BYTES + 1)).toEqual({
      ok: false,
      reason: 'size',
    });
  });

  it('accepts exactly the size cap', () => {
    expect(validateUpload('receipt', 'image/png', MAX_RECEIPT_BYTES)).toEqual({ ok: true });
  });
});

describe('extForContentType', () => {
  it('maps known types and falls back to bin', () => {
    expect(extForContentType('image/jpeg')).toBe('jpg');
    expect(extForContentType('image/png')).toBe('png');
    expect(extForContentType('image/webp')).toBe('webp');
    expect(extForContentType('application/pdf')).toBe('pdf');
    expect(extForContentType('application/octet-stream')).toBe('bin');
  });
});

describe('buildObjectKey', () => {
  it('namespaces receipts by tripId with a uuid basename and matching ext', () => {
    const key = buildObjectKey('receipt', 'trip123', 'image/webp');
    expect(key).toMatch(
      /^receipts\/trip123\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/
    );
  });

  it('namespaces itinerary tickets by tripId under the itinerary/ prefix', () => {
    const key = buildObjectKey('itinerary', 'trip123', 'application/pdf');
    expect(key).toMatch(/^itinerary\/trip123\//);
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('namespaces note photos by tripId under the notes/ prefix', () => {
    const key = buildObjectKey('note', 'trip123', 'image/webp');
    expect(key).toMatch(/^notes\/trip123\//);
    expect(key.endsWith('.webp')).toBe(true);
  });

  it('namespaces avatars by userId', () => {
    const key = buildObjectKey('avatar', 'user456', 'image/jpeg');
    expect(key).toMatch(/^avatars\/user456\//);
    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('generates a distinct key each call', () => {
    const a = buildObjectKey('receipt', 't', 'image/png');
    const b = buildObjectKey('receipt', 't', 'image/png');
    expect(a).not.toBe(b);
  });
});

describe('receipt key helpers', () => {
  it('builds the trip-namespaced prefix', () => {
    expect(receiptKeyPrefix('trip123')).toBe('receipts/trip123/');
  });

  it('accepts a key under the trip prefix and rejects others', () => {
    expect(isReceiptKeyForTrip('trip123', 'receipts/trip123/abc.webp')).toBe(true);
    expect(isReceiptKeyForTrip('trip123', 'receipts/other/abc.webp')).toBe(false);
    expect(isReceiptKeyForTrip('trip123', 'avatars/trip123/abc.webp')).toBe(false);
    expect(isReceiptKeyForTrip('', 'receipts//abc.webp')).toBe(false);
  });
});

describe('itinerary key helpers', () => {
  it('builds the trip-namespaced prefix', () => {
    expect(itineraryKeyPrefix('trip123')).toBe('itinerary/trip123/');
  });

  it('accepts a key under the trip prefix and rejects others', () => {
    expect(isItineraryKeyForTrip('trip123', 'itinerary/trip123/abc.pdf')).toBe(true);
    expect(isItineraryKeyForTrip('trip123', 'itinerary/other/abc.pdf')).toBe(false);
    // 收據與票券共用 bucket，但前綴不同：收據 key 不可當票券用，反之亦然。
    expect(isItineraryKeyForTrip('trip123', 'receipts/trip123/abc.pdf')).toBe(false);
    expect(isReceiptKeyForTrip('trip123', 'itinerary/trip123/abc.pdf')).toBe(false);
    expect(isItineraryKeyForTrip('', 'itinerary//abc.pdf')).toBe(false);
  });
});

describe('note key helpers', () => {
  it('builds the trip-namespaced prefix', () => {
    expect(noteKeyPrefix('trip123')).toBe('notes/trip123/');
  });

  it('accepts a key under the trip prefix and rejects others', () => {
    expect(isNoteKeyForTrip('trip123', 'notes/trip123/abc.webp')).toBe(true);
    expect(isNoteKeyForTrip('trip123', 'notes/other/abc.webp')).toBe(false);
    // 與收據/票券共用 bucket，但前綴不同，彼此不可互用。
    expect(isNoteKeyForTrip('trip123', 'receipts/trip123/abc.webp')).toBe(false);
    expect(isReceiptKeyForTrip('trip123', 'notes/trip123/abc.webp')).toBe(false);
    expect(isNoteKeyForTrip('', 'notes//abc.webp')).toBe(false);
  });
});

describe('note upload constraints', () => {
  it('accepts images and rejects PDF / oversize', () => {
    expect(validateUpload('note', 'image/webp', 500_000)).toEqual({ ok: true });
    expect(validateUpload('note', 'application/pdf', 1_000)).toEqual({ ok: false, reason: 'type' });
    expect(validateUpload('note', 'image/png', MAX_NOTE_BYTES + 1)).toEqual({
      ok: false,
      reason: 'size',
    });
  });
});

describe('avatar key helpers', () => {
  it('builds the user-namespaced prefix', () => {
    expect(avatarKeyPrefix('user1')).toBe('avatars/user1/');
  });

  it('accepts a key under the user prefix and rejects others', () => {
    expect(isAvatarKeyForUser('user1', 'avatars/user1/a.webp')).toBe(true);
    expect(isAvatarKeyForUser('user1', 'avatars/user2/a.webp')).toBe(false);
    expect(isAvatarKeyForUser('user1', 'receipts/user1/a.webp')).toBe(false);
    expect(isAvatarKeyForUser('', 'avatars//a.webp')).toBe(false);
  });
});
