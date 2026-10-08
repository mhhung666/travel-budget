import {
  bindWebWriteCoordination,
  claimWebTripWrite,
  releaseWebTripWrite,
} from './webWriteCoordination';
import { readExpenseOutbox } from './expenseOutbox';
import { tripKeys } from '@/hooks/queries/keys';
import type { TripShell } from '@/types';
import { z } from 'zod';
import {
  tripCreateV2Input,
  tripJoinInput,
  paymentCreateV2Input,
  paymentDeleteV2Input,
  isCentShare,
} from '@travel-budget/contracts';
import { updateExpenseSchema, setBudgetSchema, setCurrencySettingsSchema } from './validation';
import { get, update } from 'idb-keyval';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import {
  getLedgerMutation,
  createLedgerTrip,
  joinLedgerTrip,
  updateLedgerExpense,
  deleteLedgerExpense,
  writeWebPayment,
  writeWebTripSettings,
} from '@/actions';
import type { CreateTripInput, UpdateExpenseInput } from './validation';
import type { ActionResult } from '@/actions';

export type ConfirmedWebWrite =
  | {
      operation: 'budget.set' | 'currency.set';
      tripId: string;
      body: {
        client_request_id: string;
        base_currency: string;
        expected_revision: string;
        [key: string]: unknown;
      };
    }
  | {
      operation: 'trip.create';
      body: {
        client_request_id: string;
        base_currency: string;
        name: string;
        description: string;
        start_date: string | null;
        end_date: string | null;
      };
      destination?: CreateTripInput['destination_location'];
    }
  | { operation: 'trip.join'; body: { client_request_id: string; invite_code: string } }
  | {
      operation: 'expense.update';
      tripId: string;
      expenseId: string;
      body: UpdateExpenseInput & {
        client_request_id: string;
        base_currency: string;
        expected_revision: string;
      };
    }
  | {
      operation: 'expense.delete';
      tripId: string;
      expenseId: string;
      body: { client_request_id: string; base_currency: string; expected_revision: string };
    }
  | {
      operation: 'payment.create' | 'payment.delete';
      tripId: string;
      paymentId?: string;
      body: {
        client_request_id: string;
        base_currency: string;
        expected_revision: string;
        from_id?: string;
        to_id?: string;
        amount?: number;
        note?: string;
      };
    };
export interface ConfirmedWebEntry {
  version: 2;
  request: ConfirmedWebWrite;
  status: 'pending' | 'done' | 'rejected';
  result?: unknown;
  error?: string;
  savedAt: number;
}
export const confirmedWebKey = ['confirmedWebWrites'] as const;
type Journal = Record<string, ConfirmedWebEntry>;
const bindings = new WeakMap<QueryClient, { key: string; active: boolean; waitUntil?: number }>();
export function bindConfirmedWebWrites(client: QueryClient, scope: string) {
  bindWebWriteCoordination(client, scope);
  bindings.set(client, {
    key: `travel-budget-confirmed-v2:${encodeURIComponent(scope)}`,
    active: true,
  });
}
export function stopConfirmedWebWrites(client: QueryClient) {
  const b = bindings.get(client);
  if (b) b.active = false;
}
function binding(client: QueryClient) {
  const b = bindings.get(client);
  if (!b?.active) throw new Error('UNAUTHORIZED');
  return b;
}
export async function readConfirmedWebWrites(client: QueryClient): Promise<Journal> {
  const b = binding(client);
  const value = (await get(b.key)) ?? {};
  if (!b.active) throw new Error('UNAUTHORIZED');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('ledger.storageInvalid');
  for (const [id, entry] of Object.entries(value as Journal)) {
    if (
      !entry ||
      entry.version !== 2 ||
      !['pending', 'done', 'rejected'].includes(entry.status) ||
      !Number.isFinite(entry.savedAt) ||
      entry.request?.body?.client_request_id !== id
    )
      throw new Error('ledger.storageInvalid');
    validateRequest(entry.request);
  }
  return value;
}
async function writeEntry(client: QueryClient, entry: ConfirmedWebEntry, initial = false) {
  const b = binding(client);
  let result: Journal = {};
  await update<Journal>(b.key, (old = {}) => {
    if (!b.active) throw new Error('UNAUTHORIZED');
    const id = entry.request.body.client_request_id;
    if (
      initial &&
      Object.values(old).some(
        (e) =>
          e.status === 'pending' &&
          e.request.body.client_request_id !== id &&
          ('tripId' in e.request && 'tripId' in entry.request
            ? canonicalTrip(client, e.request.tripId) ===
              canonicalTrip(client, entry.request.tripId)
            : e.request.operation === entry.request.operation)
      )
    )
      throw new Error('ledger.pendingWrite');
    const existing = old[id];
    if (existing && JSON.stringify(existing.request) !== JSON.stringify(entry.request))
      throw new Error('CONFLICT');
    result = {
      ...old,
      [id]: existing?.status === 'done' || existing?.status === 'rejected' ? existing : entry,
    };
    return result;
  });
  if (!b.active) throw new Error('UNAUTHORIZED');
  client.setQueryData(confirmedWebKey, result);
  return result[entry.request.body.client_request_id];
}
const definitiveWriteRefusals = new Set([
  'INVITATION_INVALID',
  'FEATURE_NOT_AVAILABLE',
  'RESOURCE_CHANGED',
  'RESOURCE_GONE',
  'SETTLEMENT_CHANGED',
  'LEDGER_CURRENCY_MISMATCH',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
]);
class WebWriteError extends Error {
  constructor(
    message: string,
    readonly retryAfter?: number,
    readonly code?: string
  ) {
    super(message);
  }
}
async function unwrap<T>(client: QueryClient, p: Promise<ActionResult<T>>) {
  const r = await p;
  if (!r.success) {
    if (r.retryAfter && Number.isFinite(r.retryAfter) && r.retryAfter > 0) {
      await saveWebCooldown(client, r.retryAfter);
    }
    throw new WebWriteError(r.error, r.retryAfter, r.code);
  }
  return r.data;
}
export async function resumeConfirmedWebWrite(
  client: QueryClient,
  entry: ConfirmedWebEntry
): Promise<unknown> {
  const b = binding(client);
  const request = entry.request;
  validateRequest(request);
  if (entry.status === 'done') {
    await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
    return entry.result;
  }
  if (entry.status === 'rejected') {
    await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
    throw new Error(entry.error);
  }
  if (!onlineManager.isOnline()) throw new Error('ledger.onlineOnly');
  await assertCooldown(client);
  if ('tripId' in request)
    await claimWebTripWrite(client, request.tripId, request.body.client_request_id);
  if (!b.active) throw new Error('UNAUTHORIZED');
  const receipt = await unwrap(client, getLedgerMutation(request.body.client_request_id));
  if (!b.active) throw new Error('UNAUTHORIZED');
  if (receipt.status !== 'not_found' && receipt.operation !== request.operation)
    throw new Error('LEDGER_DATA_INVALID');
  if (
    receipt.status === 'committed' &&
    'base_currency' in request.body &&
    receipt.ledger?.baseCurrency !== request.body.base_currency
  )
    throw new Error('LEDGER_DATA_INVALID');
  if (
    receipt.status === 'committed' &&
    'expenseId' in request &&
    receipt.result &&
    'expenseId' in receipt.result &&
    receipt.result.expenseId !== request.expenseId
  )
    throw new Error('LEDGER_DATA_INVALID');
  if (receipt.status === 'rejected') {
    await writeEntry(client, { ...entry, status: 'rejected', error: receipt.code });
    await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
    void client.invalidateQueries();
    throw new Error(receipt.code);
  }
  if (receipt.status === 'committed') {
    const result =
      request.operation === 'trip.create' || request.operation === 'trip.join'
        ? { id: receipt.result.tripId }
        : receipt.result;
    await writeEntry(client, { ...entry, status: 'done', result });
    await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
    void client.invalidateQueries();
    return result;
  }
  let result: unknown;
  try {
    switch (request.operation) {
      case 'trip.create':
        result = await unwrap(client, createLedgerTrip(request.body, request.destination));
        break;
      case 'trip.join':
        result = await unwrap(client, joinLedgerTrip(request.body));
        break;
      case 'budget.set':
      case 'currency.set':
        result = await unwrap(
          client,
          writeWebTripSettings(
            request.tripId,
            request.operation === 'budget.set' ? 'budget' : 'currency',
            request.body
          )
        );
        break;
      case 'expense.update':
        result = await unwrap(
          client,
          updateLedgerExpense(request.tripId, request.expenseId, request.body)
        );
        break;
      case 'expense.delete':
        result = await unwrap(
          client,
          deleteLedgerExpense(request.tripId, request.expenseId, request.body)
        );
        break;
      default:
        result = await unwrap(
          client,
          writeWebPayment(request.tripId, request.operation, request.body, request.paymentId)
        );
    }
  } catch (error) {
    // Only an explicit write refusal can retire this intent. Transport failures and
    // lookup denials remain unknown: a committed receipt may be temporarily inaccessible.
    const refused = error instanceof WebWriteError && definitiveWriteRefusals.has(error.code ?? '');
    if (b.active) {
      await writeEntry(client, {
        ...entry,
        status: refused ? 'rejected' : 'pending',
        error: error instanceof Error ? error.message : String(error),
      });
      if (refused) {
        await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
        void client.invalidateQueries();
      }
    }
    throw error;
  }
  if (!b.active) throw new Error('UNAUTHORIZED');
  await writeEntry(client, { ...entry, status: 'done', result });
  await releaseWebTripWrite(client, request.body.client_request_id).catch(() => undefined);
  void client.invalidateQueries();
  return result;
}
function validateRequest(request: ConfirmedWebWrite) {
  if (
    !request ||
    ![
      'budget.set',
      'currency.set',
      'trip.create',
      'trip.join',
      'expense.update',
      'expense.delete',
      'payment.create',
      'payment.delete',
    ].includes(request.operation)
  )
    throw new Error('VALIDATION_ERROR');
  if (
    'tripId' in request &&
    (typeof request.tripId !== 'string' ||
      !/^(?:[a-f0-9]{24}|[a-z0-9]{6,10})$/.test(request.tripId))
  )
    throw new Error('VALIDATION_ERROR');
  const confirmation = z.object({
    client_request_id: z.string().uuid(),
    base_currency: z.string().regex(/^[A-Z]{3}$/),
    expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
  });
  if (request.operation === 'trip.create') tripCreateV2Input.parse(request.body);
  else if (request.operation === 'trip.join') tripJoinInput.parse(request.body);
  else {
    confirmation.parse(request.body);
    if (request.operation === 'payment.create') paymentCreateV2Input.parse(request.body);
    else if (request.operation === 'payment.delete') paymentDeleteV2Input.parse(request.body);
    else if (request.operation === 'expense.update') updateExpenseSchema.parse(request.body);
    else if (request.operation === 'budget.set') {
      const body = setBudgetSchema.parse(request.body);
      if (
        (body.total != null && !isCentShare(body.total)) ||
        body.categories?.some((c) => !isCentShare(c.amount))
      )
        throw new Error('VALIDATION_ERROR');
    } else if (request.operation === 'currency.set') setCurrencySettingsSchema.parse(request.body);
  }
}
function canonicalTrip(client: QueryClient, id: string) {
  return client.getQueryData<TripShell>(tripKeys.shell(id))?.id ?? id;
}
export async function confirmWebWrite(client: QueryClient, request: ConfirmedWebWrite) {
  if (!onlineManager.isOnline()) throw new Error('ledger.onlineOnly');
  validateRequest(request);
  await readConfirmedWebWrites(client);
  await assertCooldown(client);
  if ('tripId' in request) {
    const c = await readExpenseOutbox(client);
    if (
      Object.values(c).some(
        (e) =>
          e.status === 'pending' &&
          canonicalTrip(client, e.vars.tripId) === canonicalTrip(client, request.tripId)
      )
    )
      throw new Error('ledger.pendingWrite');
  }
  const durable = await writeEntry(
    client,
    { version: 2, request: structuredClone(request), status: 'pending', savedAt: Date.now() },
    true
  );
  return resumeConfirmedWebWrite(client, durable);
}
export async function assertNoConfirmedWebWrite(client: QueryClient, tripId: string) {
  if (!bindings.has(client)) return; // Standalone clients have no durable application journal.
  await assertCooldown(client);
  const entries = await readConfirmedWebWrites(client);
  if (
    Object.values(entries).some(
      (e) =>
        e.status === 'pending' &&
        'tripId' in e.request &&
        canonicalTrip(client, e.request.tripId) === canonicalTrip(client, tripId)
    )
  )
    throw new Error('ledger.pendingWrite');
}

async function assertCooldown(client: QueryClient) {
  const b = binding(client);
  const persisted = (await get<number>(`${b.key}:wait`)) ?? 0;
  if (!b.active) throw new Error('UNAUTHORIZED');
  if (typeof persisted !== 'number' || !Number.isFinite(persisted) || persisted < 0)
    throw new Error('ledger.storageInvalid');
  b.waitUntil = Math.max(b.waitUntil ?? 0, persisted);
  if (Date.now() < b.waitUntil) throw new Error('ledger.wait');
}

export async function saveWebCooldown(client: QueryClient, seconds: number) {
  const b = binding(client);
  const until = Date.now() + seconds * 1000;
  b.waitUntil = Math.max(b.waitUntil ?? 0, until);
  await update<number>(`${b.key}:wait`, (old) => Math.max(old ?? 0, until));
}

export async function assertWebCooldown(client: QueryClient) {
  if (bindings.has(client)) await assertCooldown(client);
}
