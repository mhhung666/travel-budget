import { expect, it, vi } from 'vitest';
import { ApiClient } from '@/api/client';
import { SessionManager } from '@/api/session';
import { EmailChanger } from './EmailChanger';
const alice = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const bob = { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob' };
const ok = (data: unknown) => Response.json({ data });
async function setup() {
  let email = 'old@example.com',
    now = 1000000,
    online = true;
  const write = vi.fn(async (url: string) => {
    if (url.endsWith('/request')) return ok({ sent: true, newEmail: 'new@example.com' });
    if (url.endsWith('/confirm')) {
      email = 'new@example.com';
      return ok({ changed: true, email });
    }
    return ok({ cancelled: true });
  });
  const set = vi.fn(),
    clear = vi.fn(),
    cache = vi.fn();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/login'))
      return ok({
        user: JSON.parse(String(init?.body)).username === 'bob' ? bob : alice,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
    if (url.endsWith('/profile')) return ok({ ...alice, email });
    return write(url);
  });
  const manager = new SessionManager(
    new ApiClient('https://example.invalid/api/v2', fetcher),
    { get: async () => null, set, clear },
    cache
  );
  await manager.login('alice', 'password');
  const changer = new EmailChanger(
    manager,
    () => online,
    () => now
  );
  await changer.read();
  changer.edit('email', ' NEW@example.com ');
  return {
    changer,
    manager,
    fetcher,
    write,
    set,
    clear,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
    offline: () => {
      online = false;
    },
  };
}
it('explicit send and confirmation only once, target-bound normalized input, updates private email without persisting it or ending sessions', async () => {
  const h = await setup();
  await Promise.all([h.changer.send('zh'), h.changer.send('zh')]);
  expect(h.write).toHaveBeenCalledOnce();
  expect(JSON.parse(String(h.fetcher.mock.calls.at(-1)![1]?.body))).toEqual({
    new_email: 'new@example.com',
    locale: 'zh',
  });
  h.changer.edit('code', '012345');
  await Promise.all([h.changer.confirm(), h.changer.confirm()]);
  expect(h.write).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(h.fetcher.mock.calls.at(-1)![1]?.body))).toEqual({
    new_email: 'new@example.com',
    code: '012345',
  });
  expect(h.changer.getSnapshot()).toMatchObject({
    profile: { email: 'new@example.com' },
    result: 'changed',
    code: '',
    email: '',
  });
  expect(JSON.stringify(h.set.mock.calls)).not.toMatch(/example.com|012345/);
  expect(h.clear).not.toHaveBeenCalled();
  expect(h.manager.getSnapshot().status).toBe('signedIn');
});
it('send limit does not lock verification, including 120s deadline and manual retry', async () => {
  const h = await setup();
  await h.changer.send('en');
  h.advance(61000);
  h.write.mockImplementationOnce(async () =>
    Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'Retry-After': '120' } }
    )
  );
  await h.changer.send('en');
  await h.changer.send('en');
  expect(h.write).toHaveBeenCalledTimes(2);
  h.changer.edit('code', '123456');
  await h.changer.confirm();
  expect(h.changer.getSnapshot().result).toBe('changed');
});
it('verify quota does not prevent cancellation or sending after send cooldown', async () => {
  const h = await setup();
  await h.changer.send('en');
  h.write.mockImplementationOnce(async () =>
    Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'Retry-After': '120' } }
    )
  );
  h.changer.edit('code', '123456');
  await h.changer.confirm();
  h.changer.edit('code', '123456');
  await h.changer.confirm();
  expect(h.write).toHaveBeenCalledTimes(2);
  await h.changer.cancel();
  expect(h.changer.getSnapshot().result).toBe('cancelled');
});
it.each(['network', '500', '401', 'invalid'])(
  'unknown %s freezes writes, erases code, does not refresh/replay; manual profile read restores decisions',
  async (mode) => {
    const h = await setup();
    h.write.mockImplementationOnce(async () => {
      if (mode === 'network') throw new TypeError('lost');
      if (mode === 'invalid') return ok({ sent: true });
      return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: Number(mode) });
    });
    await h.changer.send('en');
    expect(h.changer.getSnapshot().uncertain).toBe(true);
    await h.changer.send('en');
    await h.changer.cancel();
    expect(h.write).toHaveBeenCalledOnce();
    expect(h.fetcher.mock.calls.some(([url]) => url.endsWith('/refresh'))).toBe(false);
    await h.changer.read();
    expect(h.changer.getSnapshot()).toMatchObject({
      uncertain: false,
      result: 'current',
      stage: 'verify',
    });
    expect(h.write).toHaveBeenCalledOnce();
  }
);
it.each([
  'INVALID_CODE',
  'CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'CONFLICT',
  'RESOURCE_CHANGED',
  'EMAIL_DELIVERY_FAILED',
])(
  'definite %s exposes a refusal, retains email, clears code and makes no success claim',
  async (code) => {
    const h = await setup();
    await h.changer.send('en');
    h.write.mockImplementationOnce(async () =>
      Response.json({ error: { code } }, { status: code === 'EMAIL_DELIVERY_FAILED' ? 503 : 400 })
    );
    h.changer.edit('code', '123456');
    await h.changer.confirm();
    expect(h.changer.getSnapshot()).toMatchObject({
      uncertain: false,
      error: { code },
      email: 'new@example.com',
      code: '',
      result: '',
    });
  }
);
it('invalid inputs, offline and disposal never send or retain private form data', async () => {
  const h = await setup();
  h.changer.edit('email', 'invalid');
  await h.changer.send('en');
  expect(h.changer.getSnapshot().error).toMatchObject({ code: 'EMAIL_INVALID' });
  h.changer.edit('email', 'new@example.com');
  h.offline();
  await h.changer.send('en');
  expect(h.write).not.toHaveBeenCalled();
  h.changer.dispose();
  expect(h.changer.getSnapshot()).toMatchObject({ email: '', code: '', profile: undefined });
});
it('old-account delayed response never updates a later login', async () => {
  const h = await setup();
  let finish!: (r: Response) => void;
  h.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const sending = h.changer.send('en');
  await vi.waitFor(() => expect(finish).toBeDefined());
  await h.manager.login('bob', 'password');
  finish(ok({ sent: true, newEmail: 'new@example.com' }));
  await sending;
  expect(h.manager.getSnapshot().user).toEqual(bob);
  expect(h.changer.getSnapshot().result).toBe('');
});
it('lost confirmation is checked with a read after a fresh screen, without resending the code', async () => {
  const h = await setup();
  await h.changer.send('en');
  h.changer.edit('code', '123456');
  const actual = h.write.getMockImplementation()!;
  h.write.mockImplementationOnce(async (url) => {
    await actual(url);
    throw new TypeError('lost');
  });
  await h.changer.confirm();
  expect(h.changer.getSnapshot().uncertain).toBe(true);
  h.changer.dispose();
  const restarted = new EmailChanger(h.manager, () => true);
  await restarted.read();
  expect(restarted.getSnapshot()).toMatchObject({
    profile: { email: 'new@example.com' },
    code: '',
    email: '',
  });
  expect(h.write).toHaveBeenCalledTimes(2);
});
