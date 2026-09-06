import { describe, expect, it, vi } from 'vitest';
import {
  executeExpensePushBatch,
  type ExpensePushExecutorDependencies,
} from '@/lib/expensePushExecutor';

const id = (n: number) => n.toString(16).padStart(24, '0');
const checkpoint = { status: 'accepted' as const, recordedAt: new Date(0) };

function setup() {
  const progress: Record<string, { status: 'accepted' | 'expired'; recordedAt: Date }> = {};
  const send = vi.fn().mockResolvedValue('accepted');
  const read = vi.fn().mockImplementation(async () => ({ ...progress }));
  const record = vi.fn().mockImplementation(async (key: string) => {
    progress[key] = checkpoint;
    return true;
  });
  const prepare = vi.fn().mockResolvedValue({ status: 'ready', send });
  const dependencies: ExpensePushExecutorDependencies = { read, record, prepare, now: () => 0 };
  return { dependencies, progress, send, read, record, prepare };
}

describe('expense push batch executor (dormant)', () => {
  it.each(['accepted', 'failed', 'expired'])(
    'only cleans confirmed expired results: %s',
    async (outcome) => {
      const s = setup();
      const cleanupExpired = vi.fn().mockResolvedValue(undefined);
      s.send.mockResolvedValue(outcome);
      s.prepare.mockResolvedValue({ status: 'ready', send: s.send, cleanupExpired });
      s.record.mockImplementation(async (key: string) => {
        expect(cleanupExpired).not.toHaveBeenCalled();
        if (outcome === 'failed') throw new Error('Failed must not be checkpointed');
        s.progress[key] = { ...checkpoint, status: outcome as 'accepted' | 'expired' };
        return true;
      });
      const result = await executeExpensePushBatch([id(1)], s.dependencies);
      expect(cleanupExpired).toHaveBeenCalledTimes(outcome === 'expired' ? 1 : 0);
      expect(result.status).toBe(outcome === 'failed' ? 'retry' : 'exhausted');
    }
  );

  it.each(['refused', 'thrown', 'accepted-first', 'lease-lost', 'budget'])(
    'skips cleanup when %s',
    async (mode) => {
      const s = setup();
      const cleanupExpired = vi.fn();
      s.send.mockResolvedValue('expired');
      s.prepare.mockResolvedValue({ status: 'ready', send: s.send, cleanupExpired });
      if (mode === 'refused') s.record.mockResolvedValue(false);
      if (mode === 'thrown') s.record.mockRejectedValue(new Error('checkpoint error'));
      if (mode === 'lease-lost')
        s.record.mockImplementation(async () => {
          s.read.mockResolvedValue(null);
          return true;
        });
      let elapsed = 0;
      if (mode === 'budget') {
        s.dependencies.now = () => elapsed;
        s.record.mockImplementation(async () => {
          elapsed = 30_000;
          return true;
        });
      }
      if (mode === 'thrown')
        await expect(executeExpensePushBatch([id(1)], s.dependencies)).rejects.toThrow(
          'checkpoint error'
        );
      else {
        const result = await executeExpensePushBatch([id(1)], s.dependencies);
        if (mode === 'lease-lost' || mode === 'refused') expect(result.status).toBe('stopped');
      }
      expect(cleanupExpired).not.toHaveBeenCalled();
    }
  );

  it.each(['read', 'cleanup'])(
    'isolates post-checkpoint %s failure without resending',
    async (failure) => {
      const s = setup();
      const cleanupExpired = vi.fn().mockRejectedValue(new Error('private details'));
      s.send.mockResolvedValue('expired');
      s.prepare.mockResolvedValue({ status: 'ready', send: s.send, cleanupExpired });
      s.record.mockImplementation(async (key: string) => {
        s.progress[key] = { ...checkpoint, status: 'expired' };
        if (failure === 'read') s.read.mockRejectedValueOnce(new Error('DB unavailable'));
        return true;
      });
      expect(await executeExpensePushBatch([id(1)], s.dependencies)).toMatchObject({
        status: 'exhausted',
        checkpointed: 1,
        cleanupFailed: 1,
      });
      await executeExpensePushBatch([id(1)], s.dependencies);
      expect(s.send).toHaveBeenCalledOnce();
    }
  );

  it('deduplicates devices and checkpoints before preparing the next one', async () => {
    const s = setup();
    s.prepare.mockImplementation(async (key: string) => {
      if (key === id(2)) expect(s.record).toHaveBeenCalledWith(id(1), 'accepted');
      return { status: 'ready', send: s.send };
    });
    expect(await executeExpensePushBatch([id(1), id(1), id(2)], s.dependencies)).toEqual({
      status: 'exhausted',
      attempted: 2,
      checkpointed: 2,
      skipped: 0,
      cleanupFailed: 0,
    });
  });

  it('retries only unfinished devices on the next run', async () => {
    const s = setup();
    s.send.mockResolvedValueOnce('accepted').mockResolvedValueOnce('failed');
    expect((await executeExpensePushBatch([id(1), id(2)], s.dependencies)).status).toBe('retry');
    s.send.mockClear();
    expect(await executeExpensePushBatch([id(1), id(2)], s.dependencies)).toEqual({
      status: 'exhausted',
      attempted: 1,
      checkpointed: 1,
      skipped: 1,
      cleanupFailed: 0,
    });
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it('checkpoints expired subscriptions as terminal', async () => {
    const s = setup();
    s.send.mockResolvedValue('expired');
    await executeExpensePushBatch([id(1)], s.dependencies);
    expect(s.record).toHaveBeenCalledWith(id(1), 'expired');
  });

  it.each(['stop', 'disabled', 'skip'] as const)(
    'does not send when preparation returns %s',
    async (status) => {
      const s = setup();
      s.prepare.mockResolvedValue({ status });
      const result = await executeExpensePushBatch([id(1)], s.dependencies);
      expect(result.status).toBe(
        status === 'stop' ? 'stopped' : status === 'skip' ? 'exhausted' : 'disabled'
      );
      expect(s.send).not.toHaveBeenCalled();
      expect(s.record).not.toHaveBeenCalled();
    }
  );

  it.each([0, 1, 2])('stops on lease loss at read %i', async (readIndex) => {
    const s = setup();
    for (let i = 0; i < readIndex; i++) s.read.mockResolvedValueOnce({});
    s.read.mockResolvedValueOnce(null);
    expect((await executeExpensePushBatch([id(1)], s.dependencies)).status).toBe('stopped');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('skips progress recorded during preparation', async () => {
    const s = setup();
    s.prepare.mockImplementation(async () => {
      s.progress[id(1)] = checkpoint;
      return { status: 'ready', send: s.send };
    });
    expect((await executeExpensePushBatch([id(1)], s.dependencies)).skipped).toBe(1);
    expect(s.send).not.toHaveBeenCalled();
  });

  it('rejects capacity overflow before the first send', async () => {
    const s = setup();
    s.progress[id(0)] = checkpoint;
    expect(
      (
        await executeExpensePushBatch(
          Array.from({ length: 256 }, (_, i) => id(i + 1)),
          s.dependencies
        )
      ).status
    ).toBe('capacity');
    expect(s.prepare).not.toHaveBeenCalled();
  });

  it('stops on checkpoint refusal without sending the next device', async () => {
    const s = setup();
    s.record.mockResolvedValue(false);
    expect((await executeExpensePushBatch([id(1), id(2)], s.dependencies)).status).toBe('stopped');
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it.each(['read', 'prepare', 'send', 'record'] as const)(
    'propagates %s errors',
    async (operation) => {
      const s = setup();
      s[operation].mockRejectedValue(new Error('unavailable'));
      await expect(executeExpensePushBatch([id(1), id(2)], s.dependencies)).rejects.toThrow(
        'unavailable'
      );
      expect(s.send.mock.calls.length).toBeLessThanOrEqual(1);
    }
  );

  it('bounds visited devices including already completed ones', async () => {
    const s = setup();
    s.progress[id(1)] = checkpoint;
    expect(
      (await executeExpensePushBatch([id(1), id(2)], s.dependencies, { maxDevices: 1 })).status
    ).toBe('yielded');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('does not start HTTP if preparation exhausts the budget', async () => {
    const s = setup();
    let time = 0;
    s.dependencies.now = () => time;
    s.prepare.mockImplementation(async () => {
      time = 20_000;
      return { status: 'ready', send: s.send };
    });
    expect((await executeExpensePushBatch([id(1)], s.dependencies)).status).toBe('yielded');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('persists a terminal result even when HTTP runs past the budget', async () => {
    const s = setup();
    let time = 0;
    s.dependencies.now = () => time;
    s.send.mockImplementation(async () => {
      time = 30_000;
      return 'accepted';
    });
    expect((await executeExpensePushBatch([id(1), id(2)], s.dependencies)).status).toBe('yielded');
    expect(s.record).toHaveBeenCalledWith(id(1), 'accepted');
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it('does not treat an empty batch with an invalid lease as success', async () => {
    const s = setup();
    s.read.mockResolvedValue(null);
    expect((await executeExpensePushBatch([], s.dependencies)).status).toBe('stopped');
  });

  it('rejects unsafe IDs and invalid limits before I/O', async () => {
    const s = setup();
    await expect(executeExpensePushBatch(['bad.id'], s.dependencies)).rejects.toThrow(
      'Invalid subscription ID'
    );
    for (const maxDevices of [0, 257, 1.5, NaN])
      await expect(executeExpensePushBatch([], s.dependencies, { maxDevices })).rejects.toThrow(
        'Invalid device limit'
      );
    for (const budgetMs of [0, Infinity, 30_001])
      await expect(executeExpensePushBatch([], s.dependencies, { budgetMs })).rejects.toThrow(
        'Invalid time budget'
      );
    expect(s.read).not.toHaveBeenCalled();
  });

  it('rejects unknown transport outcomes without checkpointing', async () => {
    const s = setup();
    s.send.mockResolvedValue('disabled');
    await expect(executeExpensePushBatch([id(1)], s.dependencies)).rejects.toThrow(
      'Invalid push outcome'
    );
    expect(s.record).not.toHaveBeenCalled();
  });
});
