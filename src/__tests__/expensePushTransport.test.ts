import { EventEmitter } from 'node:events';
import https from 'node:https';
import webpush from 'web-push';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendExpensePushDevice } from '@/lib/expensePushTransport';

vi.mock('node:https', () => ({ default: { request: vi.fn() } }));
vi.mock('web-push', () => ({ default: { generateRequestDetails: vi.fn() } }));

const input = {
  subscription: { endpoint: 'https://push.example/device', keys: { auth: 'auth', p256dh: 'key' } },
  payload: { title: 'Trip', body: 'Expense', url: '/trip' },
  vapidDetails: { subject: 'mailto:test@example.com', publicKey: 'public', privateKey: 'private' },
};

describe('single-device expense push transport', () => {
  let request: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let respond: (response: unknown) => void;
  function response(statusCode: number | undefined = 201) {
    const incoming = Object.assign(new EventEmitter(), {
      statusCode: statusCode as number | undefined,
      complete: true,
      resume: vi.fn(),
      destroy: vi.fn(),
    });
    respond(incoming);
    return incoming;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    request = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    vi.mocked(webpush.generateRequestDetails).mockReturnValue({
      endpoint: input.subscription.endpoint,
      method: 'POST',
      headers: { Authorization: 'signed' },
      body: Buffer.from('encrypted'),
    });
    vi.mocked(https.request).mockImplementation((...args: unknown[]) => {
      respond = args[2] as typeof respond;
      return request as unknown as ReturnType<typeof https.request>;
    });
  });
  afterEach(() => {
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it.each([
    [200, 'accepted'],
    [201, 'accepted'],
    [299, 'accepted'],
    [404, 'expired'],
    [410, 'expired'],
    [302, 'failed'],
    [401, 'failed'],
    [429, 'failed'],
    [500, 'failed'],
  ])('classifies completed HTTP %s as %s without retry', async (code, expected) => {
    const pending = sendExpensePushDevice(input);
    response(code as number).emit('end');
    expect(await pending).toBe(expected);
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(webpush.generateRequestDetails).toHaveBeenCalledWith(
      input.subscription,
      JSON.stringify(input.payload),
      { vapidDetails: input.vapidDetails }
    );
    expect(request.end).toHaveBeenCalledWith(Buffer.from('encrypted'));
    expect(https.request).toHaveBeenCalledWith(
      new URL(input.subscription.endpoint),
      { method: 'POST', headers: { Authorization: 'signed' }, agent: false },
      expect.any(Function)
    );
    expect(request.destroy).toHaveBeenCalledOnce();
  });

  it('aborts a request that never receives headers', async () => {
    const pending = sendExpensePushDevice(input);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe('failed');
    expect(request.destroy).toHaveBeenCalledOnce();
    request.emit('error', new Error('late socket error'));
    const late = response();
    expect(late.destroy).toHaveBeenCalledOnce();
    late.emit('end');
  });

  it('aborts a continuously streaming response at the total deadline', async () => {
    const pending = sendExpensePushDevice({ ...input, timeoutMs: 100 });
    const incoming = response();
    await vi.advanceTimersByTimeAsync(90);
    incoming.emit('data', Buffer.from('still streaming'));
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toBe('failed');
    expect(incoming.destroy).toHaveBeenCalledOnce();
    expect(request.destroy).toHaveBeenCalledOnce();
  });

  it.each(['error', 'aborted', 'close'])(
    'does not accept an incomplete response: %s',
    async (event) => {
      const pending = sendExpensePushDevice(input);
      const incoming = response();
      incoming.complete = false;
      incoming.emit(event, new Error('private provider details'));
      expect(await pending).toBe('failed');
    }
  );

  it('handles socket errors without exposing their contents', async () => {
    const pending = sendExpensePushDevice(input);
    request.emit('error', new Error('private endpoint'));
    expect(await pending).toBe('failed');
  });

  it('does not accept a response without a status code', async () => {
    const pending = sendExpensePushDevice(input);
    const incoming = response();
    incoming.statusCode = undefined;
    incoming.emit('end');
    expect(await pending).toBe('failed');
  });

  it('preserves acceptance when cleanup emits a late error', async () => {
    const pending = sendExpensePushDevice(input);
    request.destroy.mockImplementation(() => request.emit('error', new Error('closed')));
    const incoming = response();
    incoming.emit('end');
    incoming.emit('close');
    expect(await pending).toBe('accepted');
    expect(request.destroy).toHaveBeenCalledOnce();
  });

  it.each(['crypto', 'request', 'end'])(
    'handles synchronous %s errors and clears timers',
    async (stage) => {
      const fail = () => {
        throw new Error('private keys');
      };
      if (stage === 'crypto') vi.mocked(webpush.generateRequestDetails).mockImplementation(fail);
      if (stage === 'request') vi.mocked(https.request).mockImplementation(fail);
      if (stage === 'end') request.end.mockImplementation(fail);
      expect(await sendExpensePushDevice(input)).toBe('failed');
    }
  );

  it.each([0, -1, 10_001, 1.5, NaN])('rejects invalid timeout %s before I/O', async (timeoutMs) => {
    await expect(sendExpensePushDevice({ ...input, timeoutMs })).rejects.toThrow('Invalid');
    expect(https.request).not.toHaveBeenCalled();
  });

  it.each(['http://push.example', 'https://user:pass@push.example', 'invalid'])(
    'rejects unsafe endpoint %s',
    async (endpoint) => {
      vi.mocked(webpush.generateRequestDetails).mockReturnValue({
        endpoint,
        method: 'POST',
        headers: {},
        body: null,
      });
      expect(await sendExpensePushDevice(input)).toBe('failed');
      expect(https.request).not.toHaveBeenCalled();
    }
  );
});
