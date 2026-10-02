import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { processExpenseDelivery } from '@/lib/expenseDeliveryWorker';

function setup() {
  return {
    queue: {
      reapExpired: vi.fn().mockResolvedValue(null),
      claim: vi
        .fn()
        .mockResolvedValue({ _id: new mongo.ObjectId(), expenseDelivery: { token: 'token' } }),
      renew: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn().mockResolvedValue(true),
      yield: vi.fn().mockResolvedValue(true),
      abandon: vi.fn().mockResolvedValue(true),
    },
    persist: vi.fn().mockResolvedValue({ status: 'persisted', recipients: [] }),
    run: vi.fn().mockResolvedValue({ status: 'exhausted' }),
    pushEnabled: true,
  };
}
describe('expense delivery worker policy', () => {
  it('does not claim after bounded expired-job reaping', async () => {
    const deps = setup();
    deps.queue.reapExpired.mockResolvedValue({});
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'dead' });
    expect(deps.queue.claim).not.toHaveBeenCalled();
  });
  it('does nothing when no jobs are due', async () => {
    const deps = setup();
    deps.queue.claim.mockResolvedValue(null);
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'idle' });
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it('persists records before push and completes only an exhausted cohort', async () => {
    const deps = setup();
    await processExpenseDelivery(deps);
    expect(deps.persist.mock.invocationCallOrder[0]).toBeLessThan(
      deps.run.mock.invocationCallOrder[0]
    );
    expect(deps.run.mock.invocationCallOrder[0]).toBeLessThan(
      deps.queue.complete.mock.invocationCallOrder[0]
    );
  });
  it('no VAPID still persists in-app records without sending', async () => {
    const deps = setup();
    deps.pushEnabled = false;
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'done' });
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.run).not.toHaveBeenCalled();
  });
  it.each(['stopped', 'capacity', 'retry', 'disabled', 'yielded'])(
    'does not complete %s',
    async (status) => {
      const deps = setup();
      deps.run.mockResolvedValue({ status, progressed: status === 'yielded' });
      await processExpenseDelivery(deps);
      expect(deps.queue.complete).not.toHaveBeenCalled();
      if (status === 'yielded') {
        expect(deps.queue.yield).toHaveBeenCalledOnce();
        expect(deps.queue.fail).not.toHaveBeenCalled();
      }
      if (status === 'capacity')
        expect(deps.queue.abandon).toHaveBeenCalledWith(expect.anything(), 'token', 'capacity');
      if (status === 'retry' || status === 'disabled')
        expect(deps.queue.fail).toHaveBeenCalledWith(expect.anything(), 'token', 'delivery_failed');
    }
  );
  it('zero-progress yield consumes a failed attempt instead of looping forever', async () => {
    const deps = setup();
    deps.run.mockResolvedValue({ status: 'yielded', progressed: false });
    await processExpenseDelivery(deps);
    expect(deps.queue.yield).not.toHaveBeenCalled();
    expect(deps.queue.fail).toHaveBeenCalledWith(expect.anything(), 'token', 'worker_error');
  });
  it('unknown DB/push errors use only a fixed safe failure code', async () => {
    const deps = setup();
    deps.run.mockRejectedValue(new Error('secret endpoint'));
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'failed' });
    expect(deps.queue.fail).toHaveBeenCalledWith(expect.anything(), 'token', 'worker_error');
  });
  it('missing parent is abandoned without rebuilding records or push', async () => {
    const deps = setup();
    deps.persist.mockResolvedValue({ status: 'skipped', reason: 'trip_missing' });
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'dead' });
    expect(deps.run).not.toHaveBeenCalled();
  });
  it('CAS loss never reports successful completion', async () => {
    const deps = setup();
    deps.queue.complete.mockResolvedValue(false);
    expect(await processExpenseDelivery(deps)).toEqual({ status: 'stopped' });
  });
});
