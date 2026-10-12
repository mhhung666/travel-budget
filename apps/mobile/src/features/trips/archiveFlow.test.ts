import { expect, it, vi } from 'vitest';
import type { TripSettings } from '@/api/contracts';
import { ApiError } from '@/api/client';
import { ArchiveFlow, type ArchiveDependencies } from './archiveFlow';
const context: TripSettings = {
  tripId: 'b'.repeat(24),
  name: 'Trip',
  description: '',
  startDate: null,
  endDate: null,
  destination: null,
  role: 'member',
  archived: false,
  revision: 'c'.repeat(64),
  archiveRevision: 'd'.repeat(64),
};
function fixture() {
  let active = true,
    version = 1;
  const deps: ArchiveDependencies = {
    current: () => active,
    guard: vi.fn(async () => {
      const captured = version;
      return () => {
        if (!active || captured !== version) throw new ApiError('CANCELLED');
      };
    }),
    read: vi.fn(async (guard) => {
      guard();
      return context;
    }),
    confirm: vi.fn<ArchiveDependencies['confirm']>(async () => ({
      kind: 'completed',
      result: {
        status: 'committed',
        operation: 'trip.archive',
        resourceId: context.tripId,
        result: { tripId: context.tripId, archived: true },
      },
      refreshed: true,
    })),
    failed: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  };
  const flow = new ArchiveFlow(deps, { archived: false });
  return {
    flow,
    deps,
    revoke: () => {
      version++;
    },
    leave: () => {
      active = false;
    },
  };
}
it('ordinary member review is read-only; cancel and duplicate taps never create an extra confirmation', async () => {
  const f = fixture();
  await Promise.all([f.flow.review(), f.flow.review()]);
  expect(f.deps.read).toHaveBeenCalledOnce();
  expect(f.deps.confirm).not.toHaveBeenCalled();
  f.flow.cancel();
  await f.flow.submit();
  expect(f.deps.confirm).not.toHaveBeenCalled();
  await f.flow.review();
  await Promise.all([f.flow.submit(), f.flow.submit()]);
  expect(f.deps.confirm).toHaveBeenCalledExactlyOnceWith({
    expected_revision: context.archiveRevision,
    archived: true,
  });
  expect(f.flow.getSnapshot().status).toBe('done');
});
it('cross-Web archive changes require explicit review of the latest state', async () => {
  const f = fixture();
  vi.mocked(f.deps.read).mockResolvedValue({
    ...context,
    archived: true,
    archiveRevision: 'e'.repeat(64),
  });
  await f.flow.review();
  expect(f.flow.getSnapshot().status).toBe('conflict');
  await f.flow.submit();
  expect(f.deps.confirm).not.toHaveBeenCalled();
  await f.flow.review();
  await f.flow.submit();
  expect(f.deps.confirm).toHaveBeenCalledWith({
    expected_revision: 'e'.repeat(64),
    archived: false,
  });
});
it('a rejected receipt never silently submits a new UUID', async () => {
  const f = fixture();
  await f.flow.review();
  vi.mocked(f.deps.confirm).mockResolvedValue({
    kind: 'completed',
    result: {
      status: 'rejected',
      operation: 'trip.archive',
      code: 'RESOURCE_CHANGED',
    },
  });
  await f.flow.submit();
  await f.flow.submit();
  expect(f.flow.getSnapshot().status).toBe('conflict');
  expect(f.deps.confirm).toHaveBeenCalledOnce();
});
it('unknown result survives as a locked recovery entry; cancel, review, and resubmit do nothing', async () => {
  const f = fixture();
  await f.flow.review();
  vi.mocked(f.deps.confirm).mockResolvedValue({ kind: 'pending' });
  await f.flow.submit();
  f.flow.cancel();
  await f.flow.review();
  await f.flow.submit();
  expect(f.flow.getSnapshot().status).toBe('pending');
  expect(f.deps.confirm).toHaveBeenCalledOnce();
});
it.each(['read', 'guard'] as const)(
  '429 in %s invokes shared wait preservation and never writes',
  async (source) => {
    const f = fixture();
    vi.mocked(f.deps[source]).mockRejectedValue(new ApiError('RATE_LIMITED', 429, 120));
    await f.flow.review();
    expect(f.deps.failed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429, retryAfter: 120 })
    );
    expect(f.deps.confirm).not.toHaveBeenCalled();
  }
);
it('storage failure leaves the form unsubmitted and requires another fresh review', async () => {
  const f = fixture();
  await f.flow.review();
  vi.mocked(f.deps.confirm).mockResolvedValue({ kind: 'not-sent', error: new ApiError('STORAGE') });
  await f.flow.submit();
  expect(f.flow.getSnapshot()).toMatchObject({ status: 'error', error: { code: 'STORAGE' } });
  await f.flow.submit();
  expect(f.deps.confirm).toHaveBeenCalledOnce();
});
it('known commit stays successful when refresh fails, and retry is read-only', async () => {
  const f = fixture();
  await f.flow.review();
  vi.mocked(f.deps.confirm).mockResolvedValue({
    kind: 'completed',
    result: {
      status: 'committed',
      operation: 'trip.archive',
      resourceId: context.tripId,
      result: { tripId: context.tripId, archived: true },
    },
    refreshed: false,
  });
  await f.flow.submit();
  vi.mocked(f.deps.refresh!).mockRejectedValueOnce(new ApiError('NETWORK'));
  await f.flow.refresh();
  expect(f.flow.getSnapshot()).toMatchObject({ status: 'done', refreshed: false });
  await f.flow.refresh();
  expect(f.flow.getSnapshot()).toMatchObject({ status: 'done', refreshed: true });
  expect(f.deps.confirm).toHaveBeenCalledOnce();
});
it.each(['account', 'revoke', 'unmount'] as const)(
  '%s during read cannot reveal a late confirmation',
  async (kind) => {
    const f = fixture();
    let resolve!: (data: TripSettings) => void;
    vi.mocked(f.deps.read).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const flight = f.flow.review();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    if (kind === 'account') f.leave();
    else if (kind === 'revoke') f.revoke();
    else f.flow.dispose();
    resolve(context);
    await flight;
    await f.flow.submit();
    expect(f.flow.getSnapshot().status).not.toBe('review');
    expect(f.deps.confirm).not.toHaveBeenCalled();
  }
);
it('background invalidates an unconfirmed review', async () => {
  const f = fixture();
  await f.flow.review();
  f.flow.invalidate();
  await f.flow.submit();
  expect(f.deps.confirm).not.toHaveBeenCalled();
});

it('failed wait persistence is visible as a storage error and cannot submit', async () => {
  const f = fixture();
  vi.mocked(f.deps.read).mockRejectedValue(new ApiError('RATE_LIMITED', 429, 120));
  vi.mocked(f.deps.failed).mockRejectedValue(new ApiError('STORAGE'));
  await f.flow.review();
  expect(f.flow.getSnapshot()).toMatchObject({ status: 'error', error: { code: 'STORAGE' } });
  await f.flow.submit();
  expect(f.deps.confirm).not.toHaveBeenCalled();
});
