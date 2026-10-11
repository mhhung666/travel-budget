import { expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/api/client';
import { SessionManager } from '@/api/session';
import { memoryDatabase } from '@/test/sqlite';
import {
  createAvatarWriteStore,
  type AvatarWriteStore,
  type LocalAvatarWrite,
} from '@/storage/avatarWrites';
import { AvatarWriter } from './AvatarWriter';
const user = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const uuid = '11111111-1111-4111-8111-111111111111';
const input = {
  client_request_id: uuid,
  action: 'replace' as const,
  expectedRevision: 'a'.repeat(64),
  size: 100,
  contentType: 'image/jpeg' as const,
};
const file = '22222222-2222-4222-8222-222222222222';
const avatar = { avatarUrl: 'https://cdn.example.invalid/new.jpg', revision: 'b'.repeat(64) };
async function setup() {
  const db = memoryDatabase(),
    store = await createAvatarWriteStore(db);
  let state: unknown = { clientRequestId: uuid, status: 'not_found' },
    uploaded = false,
    loseFinish = false,
    available = true,
    failInsert = false,
    failSave = false,
    failRemove = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/login'))
      return Response.json({
        data: {
          user:
            JSON.parse(String(init?.body)).username === 'alice'
              ? user
              : { ...user, id: 'b'.repeat(24), username: 'bob' },
          accessToken: 'a',
          refreshToken: 'r',
          expiresIn: 900,
        },
      });
    const body = init?.body && JSON.parse(String(init.body));
    if (body?.client_request_id)
      state = {
        clientRequestId: uuid,
        status: body.action === 'remove' ? 'committed' : 'pending',
        ...(body.action === 'remove' ? { avatar: { ...avatar, avatarUrl: null } } : {}),
      };
    if (body?.action === 'cancel')
      state = { clientRequestId: uuid, status: 'rejected', code: 'CANCELLED' };
    if (body?.action === 'finish') {
      if (!uploaded)
        return Response.json({ error: { code: 'UPLOAD_INCOMPLETE' } }, { status: 409 });
      state = { clientRequestId: uuid, status: 'committed', avatar };
      if (loseFinish) {
        loseFinish = false;
        throw new Error('lost response');
      }
    }
    const data =
      body?.action === 'upload'
        ? {
            ...(state as object),
            upload: {
              url: 'https://store.example.invalid/put',
              contentType: 'image/jpeg',
              expiresAt: Date.now() + 120_000,
            },
          }
        : state;
    return Response.json({ data });
  });
  const manager = new SessionManager(
    new ApiClient('https://example.invalid', fetcher),
    { get: async () => null, set: async () => {}, clear: async () => {} },
    async () => {}
  );
  await manager.login('alice', 'pw');
  const proxy: AvatarWriteStore = {
    ...store,
    insert: async (...args) => {
      if (failInsert) throw new ApiError('STORAGE');
      return store.insert(...args);
    },
    save: async (...args) => {
      if (failSave) throw new ApiError('STORAGE');
      return store.save(...args);
    },
  };
  const upload = vi.fn(async (_file: string, _ticket: unknown, check: () => void) => {
    check();
    uploaded = true;
  });
  const removeFile = vi.fn(async () => {
    if (failRemove) throw new ApiError('STORAGE');
  });
  const changed = vi.fn(async () => {});
  const make = () =>
    new AvatarWriter({
      manager,
      available: () => available,
      store: async () => proxy,
      upload,
      removeFile,
      changed,
    });
  const writer = make();
  await writer.load();
  fetcher.mockClear();
  return {
    writer,
    make,
    db,
    store,
    manager,
    fetcher,
    upload,
    removeFile,
    changed,
    scope: { environment: manager.api.environment, accountId: user.id },
    set: (opts: {
      lose?: boolean;
      available?: boolean;
      insert?: boolean;
      save?: boolean;
      remove?: boolean;
      state?: unknown;
    }) => {
      if (opts.lose !== undefined) loseFinish = opts.lose;
      if (opts.available !== undefined) available = opts.available;
      if (opts.insert !== undefined) failInsert = opts.insert;
      if (opts.save !== undefined) failSave = opts.save;
      if (opts.remove !== undefined) failRemove = opts.remove;
      if (opts.state !== undefined) state = opts.state;
    },
  };
}
it('persists before any request, coalesces double confirmation and clears only after terminal acknowledgement', async () => {
  const h = await setup();
  try {
    await Promise.all([h.writer.confirm(input, file), h.writer.confirm(input, file)]);
    expect(h.writer.getSnapshot().record?.result?.status).toBe('committed');
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.changed).toHaveBeenCalledTimes(1);
    expect((await h.store.list(h.scope))[0].input).toEqual(input);
    await h.writer.dismiss();
    expect(await h.store.list(h.scope)).toEqual([]);
  } finally {
    h.db.close();
  }
});
it('never sends on persistence failure or offline, and keeps original selection ownership', async () => {
  const h = await setup();
  try {
    const saved = vi.fn();
    h.set({ insert: true });
    await h.writer.confirm(input, file, saved);
    expect(saved).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
    h.set({ insert: false, available: false });
    await h.writer.confirm(input, file, saved);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await h.store.list(h.scope)).toEqual([]);
  } finally {
    h.db.close();
  }
});
it('recovers lost finish response after restart using GET only, never another PUT or UUID', async () => {
  const h = await setup();
  try {
    h.set({ lose: true });
    await h.writer.confirm(input, file);
    expect(h.writer.getSnapshot().record?.result).toBeNull();
    h.fetcher.mockClear();
    const restart = h.make();
    await restart.load();
    expect(restart.getSnapshot().record?.result?.status).toBe('committed');
    expect(h.fetcher.mock.calls.every(([, i]) => i?.method === 'GET')).toBe(true);
    expect(h.upload).toHaveBeenCalledTimes(1);
  } finally {
    h.db.close();
  }
});
it('restart pending only queries; manual retry HEADs before PUT and preserves the original UUID', async () => {
  const h = await setup();
  try {
    const r: LocalAvatarWrite = { input, file, cancel: false, result: null };
    await h.store.insert(h.scope, r);
    h.set({ state: { clientRequestId: uuid, status: 'pending' } });
    const restart = h.make();
    await restart.load();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    await restart.retry();
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(
      h.fetcher.mock.calls.filter(
        ([, i]) => JSON.parse(String(i?.body ?? '{}')).action === 'finish'
      )
    ).toHaveLength(2);
  } finally {
    h.db.close();
  }
});
it('cancels a never-begun removal without first sending the removal, and cancellation survives failed requests', async () => {
  const h = await setup();
  try {
    const r: LocalAvatarWrite = {
      input: {
        action: 'remove',
        client_request_id: uuid,
        expectedRevision: input.expectedRevision,
      },
      cancel: false,
      result: null,
    };
    await h.store.insert(h.scope, r);
    const restart = h.make();
    await restart.load();
    h.set({ available: false });
    await restart.cancel();
    expect((await h.store.list(h.scope))[0].cancel).toBe(true);
    h.set({ available: true });
    await restart.retry();
    expect(
      h.fetcher.mock.calls.some(([, i]) => JSON.parse(String(i?.body ?? '{}')).client_request_id)
    ).toBe(false);
    expect(restart.getSnapshot().record?.result?.code).toBe('CANCELLED');
  } finally {
    h.db.close();
  }
});
it('keeps a terminal result if local file cleanup fails, so retry dismiss never repeats the server write', async () => {
  const h = await setup();
  try {
    h.set({ remove: true });
    await h.writer.confirm(input, file);
    expect(h.writer.getSnapshot().record?.result?.status).toBe('committed');
    const count = h.fetcher.mock.calls.length;
    await h.writer.retry();
    expect(h.fetcher).toHaveBeenCalledTimes(count);
    h.set({ remove: false });
    await h.writer.dismiss();
    expect(await h.store.list(h.scope)).toEqual([]);
  } finally {
    h.db.close();
  }
});
it('retains unknown outcomes on terminal persistence failure and restores via the same receipt', async () => {
  const h = await setup();
  try {
    h.set({ save: true });
    await h.writer.confirm(input, file);
    expect((await h.store.list(h.scope))[0].result).toBeNull();
    expect(h.removeFile).not.toHaveBeenCalled();
    h.set({ save: false });
    await h.writer.lookup();
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.writer.getSnapshot().record?.result?.status).toBe('committed');
  } finally {
    h.db.close();
  }
});
it('rejects mismatched result UUID without deleting the confirmed record or file', async () => {
  const h = await setup();
  try {
    await h.store.insert(h.scope, { input, file, cancel: false, result: null });
    h.set({
      state: {
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        status: 'committed',
        avatar,
      },
    });
    const restart = h.make();
    await restart.load();
    expect(restart.getSnapshot().error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(h.removeFile).not.toHaveBeenCalled();
  } finally {
    h.db.close();
  }
});
it('old screen cannot send or publish after A to B to A, and B sees no A record', async () => {
  const h = await setup();
  try {
    await h.store.insert(h.scope, { input, file, cancel: false, result: null });
    await h.writer.load();
    h.fetcher.mockClear();
    await h.manager.login('bob', 'pw');
    const bob = h.make();
    await bob.load();
    expect(bob.getSnapshot().record).toBeNull();
    await h.manager.login('alice', 'pw');
    h.fetcher.mockClear();
    await h.writer.retry();
    expect(h.fetcher).not.toHaveBeenCalled();
  } finally {
    h.db.close();
  }
});
it('429 keeps the persisted operation and API cooldown prevents immediate retry', async () => {
  const h = await setup();
  try {
    await h.store.insert(h.scope, { input, file, cancel: false, result: null });
    const restart = h.make();
    await restart.load();
    h.fetcher.mockImplementationOnce(async () =>
      Response.json(
        { error: { code: 'RATE_LIMITED' } },
        { status: 429, headers: { 'Retry-After': '120' } }
      )
    );
    await restart.retry();
    const count = h.fetcher.mock.calls.length;
    await restart.retry();
    expect(h.fetcher).toHaveBeenCalledTimes(count);
    expect((await h.store.list(h.scope))[0].result).toBeNull();
  } finally {
    h.db.close();
  }
});
it('a late committed finish after account switch cannot publish or clear the old account record/file', async () => {
  const h = await setup();
  let release!: () => void, reached!: () => void;
  const wait = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      reached = r;
    });
  const original = h.fetcher.getMockImplementation()!;
  let finishes = 0;
  h.fetcher.mockImplementation(async (url, init) => {
    const response = await original(url, init);
    if (JSON.parse(String(init?.body ?? '{}')).action === 'finish' && ++finishes === 2) {
      reached();
      await wait;
    }
    return response;
  });
  try {
    const sending = h.writer.confirm(input, file);
    await started;
    await h.manager.login('bob', 'pw');
    release();
    await sending;
    expect(h.manager.getSnapshot().user?.username).toBe('bob');
    expect(h.changed).not.toHaveBeenCalled();
    expect(h.removeFile).not.toHaveBeenCalled();
    expect((await h.store.list(h.scope))[0].result).toBeNull();
    await h.manager.login('alice', 'pw');
    const restart = h.make();
    await restart.load();
    expect(restart.getSnapshot().record?.result?.status).toBe('committed');
    expect(h.upload).toHaveBeenCalledTimes(1);
  } finally {
    release();
    h.db.close();
  }
});
it('transfers file ownership after successful persistence even if logout happened during the insert', async () => {
  const h = await setup();
  let release!: () => void, reached!: () => void;
  const wait = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      reached = r;
    });
  const insert = h.store.insert;
  h.store.insert = async (...args) => {
    reached();
    await wait;
    await insert(...args);
  };
  // The writer proxy delegates to the live store.insert, so the same SQLite record is delayed.
  const saved = vi.fn();
  try {
    const sending = h.writer.confirm(input, file, saved);
    await started;
    await h.manager.login('bob', 'pw');
    h.fetcher.mockClear();
    release();
    await sending;
    expect(saved).toHaveBeenCalledTimes(1);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect((await h.store.list(h.scope))[0].file).toBe(file);
  } finally {
    release();
    h.db.close();
  }
});
