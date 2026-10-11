// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  connect: vi.fn(),
  actor: 'a'.repeat(24),
  mobile: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: h.connect }));
vi.mock('@/models', () => ({ User: { findOne: h.read, findOneAndUpdate: h.update } }));
vi.mock('@/lib/auth', () => ({
  getSession: async () => (h.actor ? { userId: h.actor } : null),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('@/lib/mobile/session', () => ({ requireMobileUser: h.mobile }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: h.cookie }),
  headers: async () => new Headers(),
}));
import { readAccountNotifications, updateAccountNotifications } from '@/lib/accountNotifications';
import { getNotificationPrefs, updateNotificationPrefs } from '@/actions/auth.actions';
import { setLocale } from '@/actions/locale.actions';
import { GET, PATCH } from '@/app/api/v2/me/notification-preferences/route';
import { ApiError } from '@/lib/mobile/http';
const prefs = { notifyByEmail: false, locale: 'jp' };
function result(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: async () => value }) };
}
const request = (body?: unknown) =>
  new Request('http://localhost/api/v2/me/notification-preferences', {
    method: body ? 'PATCH' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  h.actor = 'a'.repeat(24);
  h.mobile.mockResolvedValue({ id: h.actor });
  h.read.mockReturnValue(result(prefs));
  h.update.mockReturnValue(result(prefs));
});
it('defaults legacy missing values, reads only self fields and excludes virtual/deleted users', async () => {
  h.read.mockReturnValue(result({}));
  expect(await readAccountNotifications(h.actor)).toEqual({ notifyByEmail: true, locale: 'zh' });
  expect(h.read).toHaveBeenCalledWith({ _id: h.actor, isVirtual: { $ne: true } });
  expect(h.read.mock.results[0].value.select).toHaveBeenCalledWith('notifyByEmail locale');
  h.read.mockReturnValue(result(null));
  await expect(readAccountNotifications(h.actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('partial atomic saves preserve unrelated fields and return actual stored values', async () => {
  expect(await updateAccountNotifications(h.actor, { notifyByEmail: true })).toEqual(prefs);
  expect(h.update).toHaveBeenCalledWith(
    { _id: h.actor, isVirtual: { $ne: true } },
    { $set: { notifyByEmail: true } },
    { returnDocument: 'after' }
  );
  await updateAccountNotifications(h.actor, { locale: 'en' });
  expect(h.update.mock.calls[1][1]).toEqual({ $set: { locale: 'en' } });
  expect(h.connect).toHaveBeenCalledTimes(2);
});
it('rejects empty, target IDs, malformed booleans and unsupported languages before any DB update', async () => {
  for (const input of [
    {},
    { actorId: h.actor, locale: 'en' },
    { locale: 'ja' },
    { notifyByEmail: 'false' },
  ])
    await expect(updateAccountNotifications(h.actor, input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  expect(h.update).not.toHaveBeenCalled();
  expect(h.connect).not.toHaveBeenCalled();
  h.update.mockReturnValue(result(null));
  await expect(updateAccountNotifications(h.actor, { locale: 'en' })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('Web cookie and native bearer adapters share stored data without expanding session/profile DTOs', async () => {
  expect(await getNotificationPrefs()).toEqual({ success: true, data: prefs });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Authorization');
  expect(await response.json()).toEqual({ data: prefs });
  expect(await updateNotificationPrefs({ notify_by_email: true })).toEqual({
    success: true,
    data: { ...prefs, message: 'OK' },
  });
  expect((await PATCH(request({ locale: 'en' }))).status).toBe(200);
  expect(h.update.mock.calls.map((c) => c[1])).toEqual([
    { $set: { notifyByEmail: true } },
    { $set: { locale: 'en' } },
  ]);
});
it('maps missing and invalid inputs, authentication failure and DB failures without false success', async () => {
  expect((await PATCH(request({ locale: 'en', userId: h.actor }))).status).toBe(400);
  expect(await updateNotificationPrefs({})).toMatchObject({
    success: false,
    code: 'VALIDATION_ERROR',
  });
  h.read.mockReturnValue(result(null));
  expect((await GET(request())).status).toBe(404);
  h.mobile.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
  expect((await GET(request())).status).toBe(401);
  h.actor = '';
  expect(await getNotificationPrefs()).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  h.actor = 'a'.repeat(24);
  h.update.mockImplementation(() => {
    throw Error('DB down');
  });
  expect(await updateNotificationPrefs({ locale: 'en' })).toMatchObject({
    success: false,
    code: 'INTERNAL_ERROR',
  });
});
it('Web display-language changes update only the cookie, never notification settings or DB', async () => {
  expect(await setLocale('en')).toEqual({ success: true, data: { locale: 'en' } });
  expect(h.cookie).toHaveBeenCalledWith('NEXT_LOCALE', 'en', expect.any(Object));
  expect(h.update).not.toHaveBeenCalled();
  expect(h.connect).not.toHaveBeenCalled();
});
