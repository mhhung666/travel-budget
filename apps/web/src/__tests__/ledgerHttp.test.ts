// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { userSchema, v2Schemas } from '@travel-budget/contracts';
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { authorizeLedger } from '@/lib/ledger';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';

const read = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
});
const named = z.object({ name: z.string(), ledger: v2Schemas.V2Ledger });

describe('explicit v2 response contracts', () => {
  it('trip mode injects only the authorized trip unit', async () => {
    const response = await apiLedgerResponse(v2Output.trip(named), async () => {
      authorizeLedger({ baseCurrency: 'JPY' });
      return { name: 'Tokyo' };
    });
    expect(await read(response)).toEqual({
      status: 200,
      body: { data: { name: 'Tokyo', ledger: { baseCurrency: 'JPY', moneyScale: 2 } } },
    });
    const missing = await apiLedgerResponse(v2Output.trip(named), async () => ({ name: 'x' }));
    expect(await read(missing)).toMatchObject({
      status: 503,
      body: { error: { code: 'LEDGER_DATA_INVALID' } },
    });
  });

  it('service mode never fills a missing unit from the current trip', async () => {
    const response = await apiLedgerResponse(v2Output.service(named), async () => {
      authorizeLedger({ baseCurrency: 'USD' });
      return { name: 'receipt without unit' };
    });
    expect(await read(response)).toMatchObject({
      status: 503,
      body: { error: { code: 'LEDGER_DATA_INVALID' } },
    });
    const preserved = await apiLedgerResponse(v2Output.service(named), async () => {
      authorizeLedger({ baseCurrency: 'USD' });
      return { name: 'old', ledger: { baseCurrency: 'TWD', moneyScale: 2 } };
    });
    expect((await read(preserved)).body.data.ledger.baseCurrency).toBe('TWD');
  });

  it('rejects output that does not match the schema the route selected', async () => {
    const response = await apiLedgerResponse(v2Output.trip(v2Schemas.V2Settlement), async () => {
      authorizeLedger({ baseCurrency: 'TWD' });
      return { name: 'not a settlement' };
    });
    expect((await read(response)).status).toBe(503);
  });

  it('identity mode carries no ledger and treats a mismatch as a server error', async () => {
    const user = { id: '507f191e810c19729de860ea', username: 'u', displayName: 'U' };
    const response = await apiLedgerResponse(v2Output.none(userSchema), async () => ({
      ...user,
      ledger: { baseCurrency: 'TWD', moneyScale: 2 },
    }));
    expect(await read(response)).toEqual({ status: 200, body: { data: user } });
    const broken = await apiLedgerResponse(v2Output.none(userSchema), async () => ({ id: 1 }));
    expect(await read(broken)).toMatchObject({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR' } },
    });
  });

  it('every v2 route method names its output contract instead of relying on its URL', () => {
    const root = join(process.cwd(), 'src/app/api/v2');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('route.ts')
    );
    // 26 ledger routes plus 7 auth/me identity routes.
    expect(files).toHaveLength(33);
    for (const file of files) {
      const source = readFileSync(join(root, file), 'utf8');
      const methods = source.match(/export async function [A-Z]+/g) ?? [];
      const explicit = source.match(/v2Output\.(none|trip|service)\(/g) ?? [];
      expect(methods.length, file).toBeGreaterThan(0);
      expect(explicit.length, file).toBe(methods.length);
    }
  });
});
