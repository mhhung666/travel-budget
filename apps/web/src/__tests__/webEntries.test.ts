// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const handler = () => vi.fn();
  return {
    reads: {
      trip: handler(),
      shell: handler(),
      landing: handler(),
      expenses: handler(),
      settlement: handler(),
      stats: handler(),
      members: handler(),
      itinerary: handler(),
      checklists: handler(),
    },
    claims: { linkMember: handler(), convertMember: handler() },
    session: vi.fn(),
  };
});
vi.mock('@/lib/publicTripReads', () => ({ publicTripReads: mocks.reads }));
vi.mock('@/lib/publicMemberClaims', () => ({ publicMemberClaims: mocks.claims }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.session }));
import { isLedgerV2 } from '@/lib/ledger';

const publicApi = join(process.cwd(), 'src/app/api/public');
const routeFiles = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts'))
    .sort();
const handlers = { ...mocks.reads, ...mocks.claims };

beforeEach(() => vi.clearAllMocks());

// Public share entries: B5e removed the v1 URLs; each v2 route runs its neutral handler in v2.
describe('public v2 trip routes', () => {
  const routes = routeFiles(join(publicApi, 'v2'));

  it('covers the 11 public trip routes, with no v1 route left', () => {
    expect(routes).toHaveLength(11);
    expect(existsSync(join(publicApi, 'trips'))).toBe(false);
    for (const file of routes) {
      const source = readFileSync(join(publicApi, 'v2', file), 'utf8');
      expect(source).not.toMatch(/@\/app\/api|from '\.\.?\//);
    }
  });

  it('keeps sessions out of the public handlers', () => {
    for (const file of ['publicTripReads.ts', 'publicMemberClaims.ts', 'withPublicTrip.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/lib', file), 'utf8');
      expect(source).not.toMatch(/getSession|requireMobileUser|withAuth/);
    }
  });

  it.each(routes)('%s dispatches one neutral handler in the v2 context', async (file) => {
    const route = await import(join(publicApi, 'v2', file));
    const [method] = Object.keys(route);
    expect(['GET', 'POST']).toContain(method);
    expect(Object.keys(route)).toEqual([method]);
    const runs: { name: string; v2: boolean; args: unknown[] }[] = [];
    for (const [name, fn] of Object.entries(handlers))
      fn.mockImplementation(async (...args: unknown[]) => {
        runs.push({ name, v2: isLedgerV2(), args });
        return Response.json({ name });
      });
    const request = new Request('https://example.test/x', { method });
    const context = { params: Promise.resolve({ id: 'abc12345' }) };
    await (await route[method](request, context)).json();
    expect(runs).toEqual([{ name: expect.any(String), v2: true, args: [request, context] }]);
  });
});

// Server Actions: B5d-3 removed the identities kept for old Web/PWA bundles.
describe('retired Server Action identities', () => {
  const actions = join(process.cwd(), 'src/actions');
  const exported = readdirSync(actions)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      [...readFileSync(join(actions, file), 'utf8').matchAll(/^export const (\w+)/gm)].map(
        (match) => match[1]
      )
    );

  it.each([
    'getTrips',
    'getTrip',
    'getTripShell',
    'getTripLanding',
    'getExpenses',
    'getSettlement',
    'getStats',
    'getStatsExpensePage',
    'getTripStats',
    'getYearInReview',
    'createTrip',
    'createExpense',
    'updateExpense',
    'deleteExpense',
    'lookupExpenseCreation',
    'lookupLedgerExpenseCreation',
    'recordPayment',
    'deletePayment',
    'setTripBudget',
    'setTripCurrencySettings',
  ])('%s is no longer a Server Action', (name) => {
    expect(exported).not.toContain(name);
  });

  it('every remaining ledger identity runs in the v2 context', () => {
    const source = readFileSync(join(actions, 'withAuth.ts'), 'utf8');
    expect(source).not.toMatch(/withLedgerIdentity|withLegacyTripRead/);
  });
});
