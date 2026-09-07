import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { runExpensePushBatch } from '@/lib/expensePushRunner';
import type { ExpensePushSweep } from '@/lib/expensePushSweep';

const id = new mongo.ObjectId();
const ids = Array.from({ length: 65 }, () => new mongo.ObjectId().toHexString());
function setup() {
  const sweep: ExpensePushSweep = {
    snapshotId: '12345678-1234-4234-8234-123456789abc',
    subscriptionIds: ids,
    revision: 0,
    nextIndex: 0,
    hadFailures: false,
    status: 'running',
  };
  const deps = {
    sweep: {
      read: vi.fn().mockResolvedValue({ status: 'ready', sweep }),
      initialize: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(true),
    },
    discover: vi.fn().mockResolvedValue({ status: 'ready', subscriptionIds: ids }),
    renew: vi.fn().mockResolvedValue(true),
    executor: {
      read: vi.fn().mockResolvedValue({}),
      record: vi.fn().mockResolvedValue(true),
      prepare: vi
        .fn()
        .mockResolvedValue({ status: 'ready', send: vi.fn().mockResolvedValue('failed') }),
      now: vi.fn(() => 0),
    },
  };
  return { sweep, deps };
}
describe('persisted push batch runner', () => {
  it('resumes at the stored cursor and preserves earlier failures', async () => {
    const { sweep, deps } = setup();
    sweep.nextIndex = 64;
    sweep.hadFailures = true;
    deps.executor.prepare.mockResolvedValue({
      status: 'ready',
      send: vi.fn().mockResolvedValue('accepted'),
    });
    expect((await runExpensePushBatch(id, 'token', deps)).status).toBe('retry');
    expect(deps.executor.prepare).toHaveBeenCalledExactlyOnceWith(ids[64]);
    expect(deps.sweep.save).toHaveBeenCalledWith(
      id,
      'token',
      sweep,
      expect.objectContaining({ status: 'retry' })
    );
    expect(deps.discover).not.toHaveBeenCalled();
  });
  it('initializes then rereads the winning snapshot even after a lost initialize CAS', async () => {
    const { sweep, deps } = setup();
    sweep.subscriptionIds = [];
    deps.sweep.read.mockResolvedValueOnce({ status: 'missing' });
    deps.sweep.initialize.mockResolvedValue(false);
    expect((await runExpensePushBatch(id, 'token', deps)).status).toBe('exhausted');
    expect(deps.sweep.read).toHaveBeenCalledTimes(2);
    expect(deps.executor.prepare).not.toHaveBeenCalled();
    expect(deps.executor.read).toHaveBeenCalledOnce();
  });
  it.each(['retry', 'exhausted'] as const)(
    'returns persisted %s without another HTTP',
    async (status) => {
      const { sweep, deps } = setup();
      sweep.status = status;
      expect((await runExpensePushBatch(id, 'token', deps)).status).toBe(status);
      expect(deps.executor.read).not.toHaveBeenCalled();
      expect(deps.sweep.save).not.toHaveBeenCalled();
    }
  );
  it('saves bounded progress and reports it only after CAS', async () => {
    const { deps } = setup();
    expect(await runExpensePushBatch(id, 'token', deps)).toMatchObject({
      status: 'yielded',
      progressed: true,
    });
    expect(deps.executor.prepare).toHaveBeenCalledTimes(32);
    deps.sweep.save.mockResolvedValue(false);
    expect(await runExpensePushBatch(id, 'token', deps)).toMatchObject({ status: 'stopped' });
  });
  it('stops before HTTP when lease renewal fails', async () => {
    const { deps } = setup();
    deps.renew.mockResolvedValue(false);
    expect((await runExpensePushBatch(id, 'token', deps)).status).toBe('stopped');
    expect(deps.executor.prepare).not.toHaveBeenCalled();
  });
  it('renews serially during a batch and stops when the heartbeat loses its lease', async () => {
    const { deps } = setup();
    deps.executor.now.mockReturnValueOnce(0).mockReturnValue(16_000);
    deps.renew.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await runExpensePushBatch(id, 'token', deps)).status).toBe('stopped');
    expect(deps.renew).toHaveBeenCalledTimes(2);
    expect(deps.executor.prepare).not.toHaveBeenCalled();
  });
  it.each(['capacity', 'stop'])('does not initialize after discovery %s', async (status) => {
    const { deps } = setup();
    deps.sweep.read.mockResolvedValue({ status: 'missing' });
    deps.discover.mockResolvedValue({ status });
    expect((await runExpensePushBatch(id, 'token', deps)).status).toBe(
      status === 'stop' ? 'stopped' : status
    );
    expect(deps.sweep.initialize).not.toHaveBeenCalled();
  });
  it('propagates unknown save outcomes instead of releasing progress', async () => {
    const { deps } = setup();
    deps.sweep.save.mockRejectedValue(new Error('uncertain'));
    await expect(runExpensePushBatch(id, 'token', deps)).rejects.toThrow('uncertain');
  });
});
