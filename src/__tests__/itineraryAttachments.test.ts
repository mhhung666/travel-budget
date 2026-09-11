import { beforeEach, describe, expect, it, vi } from 'vitest';
import { headObject } from '@/lib/storage';
import { resolveItineraryAttachments } from '@/lib/itineraryAttachments';
import { MAX_ITINERARY_BYTES } from '@/lib/uploads';

vi.mock('@/lib/storage', () => ({ headObject: vi.fn() }));
const inputs = Array.from({ length: 11 }, (_, i) => ({ key: `itinerary/trip/${i}.pdf` }));
const metadata = { size: 321, contentType: 'application/pdf' };
function gate() {
  let release!: (value: typeof metadata | null) => void;
  const promise = new Promise<typeof metadata | null>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
beforeEach(() => vi.resetAllMocks());

describe('bounded itinerary attachment validation', () => {
  it('runs four HEADs at once, refills freed slots, and validates every unique key', async () => {
    const gates = inputs.map(() => gate());
    vi.mocked(headObject).mockImplementation(
      (_bucket, key) => gates[inputs.findIndex((i) => i.key === key)].promise
    );
    const result = resolveItineraryAttachments('trip', 'user', [...inputs, inputs[0]], new Map());
    expect(headObject).toHaveBeenCalledTimes(4);
    gates[2].release(metadata);
    await vi.waitFor(() => expect(headObject).toHaveBeenCalledTimes(5));
    for (const g of gates) g.release(metadata);
    const resolved = await result;
    expect(headObject).toHaveBeenCalledTimes(11);
    expect(resolved?.size).toBe(11);
    expect(resolved?.get(inputs[0].key)).toMatchObject({ ...metadata, uploadedBy: 'user' });
  });

  it('stops scheduling after failure and waits for in-flight requests to settle', async () => {
    const gates = inputs.map(() => gate());
    vi.mocked(headObject).mockImplementation(
      (_bucket, key) => gates[inputs.findIndex((i) => i.key === key)].promise
    );
    let settled = false;
    const result = resolveItineraryAttachments('trip', 'user', inputs, new Map()).then((r) => {
      settled = true;
      return r;
    });
    gates[0].release(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(headObject).toHaveBeenCalledTimes(4);
    for (const g of gates.slice(1, 4)) g.release(metadata);
    expect(await result).toBeNull();
    expect(headObject).toHaveBeenCalledTimes(4);
  });

  it.each([
    null,
    { ...metadata, size: MAX_ITINERARY_BYTES + 1 },
    { ...metadata, contentType: 'text/html' },
  ])('rejects invalid server metadata %j', async (head) => {
    vi.mocked(headObject).mockResolvedValue(head);
    expect(await resolveItineraryAttachments('trip', 'user', inputs, new Map())).toBeNull();
  });
  it('handles storage rejection as a validation failure', async () => {
    vi.mocked(headObject).mockRejectedValue(new Error('offline'));
    expect(await resolveItineraryAttachments('trip', 'user', inputs, new Map())).toBeNull();
  });
  it('rejects foreign keys before making any storage calls', async () => {
    expect(await resolveItineraryAttachments('other-trip', 'user', inputs, new Map())).toBeNull();
    expect(headObject).not.toHaveBeenCalled();
  });
  it('preserves existing uploader and timestamp without HEAD and accepts empty input', async () => {
    const existing = {
      key: inputs[0].key,
      ...metadata,
      uploadedBy: 'original',
      uploadedAt: new Date(0),
    };
    const result = await resolveItineraryAttachments(
      'trip',
      'user',
      [inputs[0]],
      new Map([[existing.key, existing]])
    );
    expect(result?.get(existing.key)).toBe(existing);
    expect(await resolveItineraryAttachments('trip', 'user', [], new Map())).toEqual(new Map());
    expect(headObject).not.toHaveBeenCalled();
  });
});
