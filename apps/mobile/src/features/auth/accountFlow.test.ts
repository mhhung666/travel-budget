import { it, expect, vi, afterEach, type Mock } from 'vitest';
import { ApiClient, ApiError, type Fetcher } from '@/api/client';
import { AccountFlow, accountError, accountRetryAt } from './accountFlow';
import { messages } from '@/i18n/messages';
const user = { id: '111111111111111111111111', username: 'Tester', displayName: 'Person' };
const valid = (flow: AccountFlow) => {
  for (const [key, value] of Object.entries({
    username: ' Tester ',
    display_name: ' Person ',
    email: ' TEST@EXAMPLE.COM ',
    password: ' 密碼123 ',
    confirmation: ' 密碼123 ',
  }))
    flow.setField(key as 'username', value);
};
const setup = (
  mode: 'register' | 'request' = 'register',
  fetcher: Mock<Fetcher> = vi.fn<Fetcher>(async () => Response.json({ data: user }))
) => {
  const api = new ApiClient('https://test.example/api/v1', fetcher);
  return { flow: new AccountFlow(api, mode, 'jp'), fetcher, api };
};
afterEach(() => vi.useRealTimers());
it('register sends one normalized body, omits confirmation, and returns login details without a session', async () => {
  const { flow, fetcher } = setup();
  valid(flow);
  await flow.submit();
  const options = fetcher.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(options.body))).toEqual({
    username: 'Tester',
    display_name: 'Person',
    email: 'test@example.com',
    password: ' 密碼123 ',
  });
  expect(new Headers(options.headers).get('authorization')).toBeNull();
  expect(options.credentials).toBe('omit');
  expect(flow.getSnapshot().result).toEqual({ username: 'Tester', notice: 'registered' });
  expect(Object.values(flow.getSnapshot().fields).every((field) => !field)).toBe(true);
  await flow.submit();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['mismatch', 'bytes', 'email', 'username'])(
  'invalid %s has no HTTP request',
  async (reason) => {
    const { flow, fetcher } = setup();
    valid(flow);
    if (reason === 'mismatch') flow.setField('confirmation', 'different');
    if (reason === 'bytes') {
      flow.setField('password', '中'.repeat(25));
      flow.setField('confirmation', '中'.repeat(25));
    }
    if (reason === 'email') flow.setField('email', 'broken');
    if (reason === 'username') flow.setField('username', '  ');
    await flow.submit();
    expect(fetcher).not.toHaveBeenCalled();
    expect(flow.getSnapshot().invalid).toBeTruthy();
  }
);
it('double tap shares the busy guard; fields are frozen during submission', async () => {
  let resolve!: (r: Response) => void;
  const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      })
  );
  const { flow } = setup('register', fetcher);
  valid(flow);
  const submission = flow.submit();
  await flow.submit();
  flow.setField('username', 'intruder');
  expect(flow.getSnapshot().fields.username).toBe(' Tester ');
  expect(fetcher).toHaveBeenCalledTimes(1);
  resolve(Response.json({ data: user }));
  await submission;
});
it.each(['network', '500', 'invalid-response'])(
  'uncertain registration %s never automatically resends',
  async (failure) => {
    const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(async () => {
      if (failure === 'network') throw new Error('connection lost');
      return failure === '500'
        ? Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
        : Response.json({ data: {} });
    });
    const { flow } = setup('register', fetcher);
    valid(flow);
    await flow.submit();
    expect(accountError(flow.getSnapshot(), messages.zh)).toBe(messages.zh.registrationUnknown);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot().result).toBeUndefined();
  }
);
it('leaving clears all secrets and ignores a late response even after reactivation', async () => {
  let resolve!: (r: Response) => void;
  const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      })
  );
  const { flow } = setup('register', fetcher);
  valid(flow);
  const submission = flow.submit();
  flow.dispose();
  flow.activate();
  resolve(Response.json({ data: user }));
  await submission;
  expect(flow.getSnapshot().result).toBeUndefined();
  expect(Object.values(flow.getSnapshot().fields).every((field) => !field)).toBe(true);
});
it('leading-zero confirmation, explicit resend, locale and normalized email follow the reset flow', async () => {
  const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(async (url: string) =>
    Response.json({ data: url.endsWith('/request') ? { accepted: true } : { reset: true } })
  );
  const { flow } = setup('request', fetcher);
  flow.setField('email', ' TEST@EXAMPLE.COM ');
  await flow.submit();
  expect(flow.getSnapshot().stage).toBe('confirm');
  expect(flow.getSnapshot().accepted).toBe(true);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
    email: 'test@example.com',
    locale: 'jp',
  });
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  await flow.submit(true);
  expect(flow.getSnapshot().fields.code).toBe('');
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  await flow.submit();
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
    email: 'test@example.com',
    code: '000007',
    new_password: '123456',
  });
  expect(flow.getSnapshot().result).toEqual({ username: '', notice: 'passwordResetDone' });
  expect(Object.values(flow.getSnapshot().fields).every((field) => !field)).toBe(true);
});
it('changing recipient discards previous acceptance, code and passwords', async () => {
  const { flow } = setup(
    'request',
    vi.fn<Fetcher>(async () => Response.json({ data: { accepted: true } }))
  );
  flow.setField('email', 'first@example.com');
  await flow.submit();
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  flow.setField('email', 'second@example.com');
  expect(flow.getSnapshot().stage).toBe('request');
  expect(flow.getSnapshot().accepted).toBe(false);
  expect(flow.getSnapshot().fields.code).toBe('');
  expect(flow.getSnapshot().fields.password).toBe('');
});
it('429 uses the original deadline; it neither auto-retries nor affects account expense API paths', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(async (url: string) =>
    url.endsWith('/register')
      ? Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '120' } }
        )
      : Response.json({ data: user })
  );
  const { flow, api } = setup('register', fetcher);
  valid(flow);
  await flow.submit();
  const deadline = accountRetryAt(flow.getSnapshot());
  vi.advanceTimersByTime(31_000);
  await flow.submit();
  expect(accountRetryAt(flow.getSnapshot())).toBe(deadline);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await api.request('/me', (await import('@travel-budget/contracts')).userSchema);
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(89_000);
  await flow.submit();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('uncertain reset does not claim failure and offers login with the new password', async () => {
  const fetcher: Mock<Fetcher> = vi.fn<Fetcher>(async (url: string) => {
    if (url.endsWith('/request')) return Response.json({ data: { accepted: true } });
    throw new Error('lost response');
  });
  const { flow } = setup('request', fetcher);
  flow.setField('email', 'test@example.com');
  await flow.submit();
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  await flow.submit();
  expect(accountError(flow.getSnapshot(), messages.en)).toBe(messages.en.resetUnknown);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['INVALID_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'ACCOUNT_CONFLICT'] as const)(
  'localizes %s',
  (code) => {
    const { flow } = setup();
    const t = messages.jp;
    expect(accountError({ ...flow.getSnapshot(), error: new ApiError(code, 400) }, t)).toBe(
      t[
        {
          INVALID_CODE: 'invalidCode',
          CODE_EXPIRED: 'codeExpired',
          TOO_MANY_ATTEMPTS: 'tooManyAttempts',
          ACCOUNT_CONFLICT: 'accountConflict',
        }[code] as 'invalidCode'
      ]
    );
  }
);

it('a received code can be entered after a delivery timeout without sending again', async () => {
  const fetcher = vi.fn<Fetcher>(async (url) => {
    if (url.endsWith('/request')) throw new Error('response lost');
    return Response.json({ data: { reset: true } });
  });
  const { flow } = setup('request', fetcher);
  flow.setField('email', 'test@example.com');
  await flow.submit();
  flow.continueWithCode();
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  await flow.submit();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(flow.getSnapshot().result?.notice).toBe('passwordResetDone');
});

it.each(['initial-send', 'resend'])(
  'a 3300-second %s limit still allows a received code to reset the password',
  async (operation) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    let sends = 0;
    const fetcher = vi.fn<Fetcher>(async (url) => {
      if (url.endsWith('/request')) {
        sends++;
        if (operation === 'resend' && sends === 1)
          return Response.json({ data: { accepted: true } });
        return Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '3300' } }
        );
      }
      return Response.json({ data: { reset: true } });
    });
    const { flow } = setup('request', fetcher);
    flow.setField('email', 'test@example.com');
    await flow.submit();
    if (operation === 'initial-send') flow.continueWithCode();
    flow.setField('code', '000007');
    flow.setField('password', '123456');
    flow.setField('confirmation', '123456');
    if (operation === 'resend') await flow.submit(true);
    const deadline = accountRetryAt(flow.getSnapshot(), true);
    expect(deadline).toBe(Date.now() + 3_300_000);
    expect(accountRetryAt(flow.getSnapshot())).toBe(0);
    expect(flow.getSnapshot().fields.code).toBe('000007');
    vi.advanceTimersByTime(31_000);
    await flow.submit(true);
    expect(accountRetryAt(flow.getSnapshot(), true)).toBe(deadline);
    expect(sends).toBe(operation === 'resend' ? 2 : 1);
    await flow.submit();
    expect(fetcher.mock.calls.at(-1)?.[0]).toMatch(/\/confirm$/);
    expect(flow.getSnapshot().result?.notice).toBe('passwordResetDone');
  }
);

it('a verification limit still allows an explicit resend and keeps verification blocked until its deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  let confirmations = 0;
  const fetcher = vi.fn<Fetcher>(async (url) => {
    if (url.endsWith('/request')) return Response.json({ data: { accepted: true } });
    confirmations++;
    return confirmations === 1
      ? Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '120' } }
        )
      : Response.json({ data: { reset: true } });
  });
  const { flow } = setup('request', fetcher);
  flow.setField('email', 'test@example.com');
  await flow.submit();
  const fillCode = () => {
    flow.setField('code', '000007');
    flow.setField('password', '123456');
    flow.setField('confirmation', '123456');
  };
  fillCode();
  await flow.submit();
  const deadline = accountRetryAt(flow.getSnapshot());
  expect(deadline).toBe(Date.now() + 120_000);
  expect(accountRetryAt(flow.getSnapshot(), true)).toBe(0);
  vi.advanceTimersByTime(31_000);
  await flow.submit(true);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/request'))).toHaveLength(2);
  fillCode();
  await flow.submit();
  expect(accountRetryAt(flow.getSnapshot())).toBe(deadline);
  expect(confirmations).toBe(1);
  vi.advanceTimersByTime(89_000);
  await flow.submit();
  expect(confirmations).toBe(2);
  expect(flow.getSnapshot().result?.notice).toBe('passwordResetDone');
});

it('send and verification deadlines remain independent when both endpoints return 429', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  const started = Date.now();
  const fetcher = vi.fn<Fetcher>(async (url) =>
    Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { 'Retry-After': url.endsWith('/request') ? '3300' : '120' } }
    )
  );
  const { flow } = setup('request', fetcher);
  flow.setField('email', 'test@example.com');
  await flow.submit();
  flow.continueWithCode();
  flow.setField('code', '000007');
  flow.setField('password', '123456');
  flow.setField('confirmation', '123456');
  await flow.submit();
  expect(accountRetryAt(flow.getSnapshot())).toBe(started + 120_000);
  expect(accountRetryAt(flow.getSnapshot(), true)).toBe(started + 3_300_000);
  vi.advanceTimersByTime(31_000);
  await flow.submit();
  await flow.submit(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(accountRetryAt(flow.getSnapshot())).toBe(started + 120_000);
  expect(accountRetryAt(flow.getSnapshot(), true)).toBe(started + 3_300_000);
  vi.advanceTimersByTime(89_000);
  await flow.submit();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.at(-1)?.[0]).toMatch(/\/confirm$/);
  expect(accountRetryAt(flow.getSnapshot(), true)).toBe(started + 3_300_000);
  await flow.submit(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each(['TOO_MANY_ATTEMPTS', 'INVALID_CODE', 'RATE_LIMITED'])(
  '%s only unlocks stale resend cooldown after a confirmed locked-code response',
  async (code) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    let requests = 0;
    const fetcher = vi.fn<Fetcher>(async (url) => {
      if (url.endsWith('/request')) {
        requests++;
        if (requests <= 2)
          return Response.json(
            { error: { code: 'RATE_LIMITED' } },
            {
              status: 429,
              headers: { 'Retry-After': requests === 1 ? '900' : '29' },
            }
          );
        return Response.json({ data: { accepted: true } });
      }
      return Response.json(
        { error: { code } },
        {
          status: code === 'RATE_LIMITED' ? 429 : 400,
          headers: code === 'RATE_LIMITED' ? { 'Retry-After': '120' } : {},
        }
      );
    });
    const { flow } = setup('request', fetcher);
    flow.setField('email', 'test@example.com');
    await flow.submit();
    const deadline = accountRetryAt(flow.getSnapshot(), true);
    flow.continueWithCode();
    flow.setField('code', '000007');
    flow.setField('password', '123456');
    flow.setField('confirmation', '123456');
    await flow.submit();
    expect(requests).toBe(1); // No automatic send after a failed confirmation.
    if (code !== 'TOO_MANY_ATTEMPTS') {
      expect(accountRetryAt(flow.getSnapshot(), true)).toBe(deadline);
      await flow.submit(true);
      expect(requests).toBe(1);
      return;
    }
    expect(accountRetryAt(flow.getSnapshot(), true)).toBe(0);
    await flow.submit(true); // Must get through ApiClient's obsolete 900-second wait too.
    expect(requests).toBe(2);
    expect(accountRetryAt(flow.getSnapshot(), true)).toBe(Date.now() + 29_000);
    await flow.submit(true);
    expect(requests).toBe(2);
    vi.advanceTimersByTime(29_000);
    await flow.submit(true);
    expect(requests).toBe(3);
    expect(flow.getSnapshot().accepted).toBe(true);
  }
);
