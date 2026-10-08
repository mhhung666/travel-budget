import type {
  PendingExpense,
  PendingScope,
  PendingStatus,
  SqlDatabase,
} from '@/storage/pendingExpenses';

/**
 * Turns pending C rows saved by the current release back into rows from before B5d-1 / v2:
 * prepend it to a test's downgrade SQL, before the version columns are dropped.
 */
export const LEGACY_PENDING_SQL =
  "UPDATE pending_expense SET payload = json_remove(payload, '$.base_currency');";

/** How such a row reads after upgrading: still v1 and TWD, with its body untouched. */
export function legacyPending(record: PendingExpense): PendingExpense {
  const payload: Partial<PendingExpense['payload']> & { base_currency?: string } = {
    ...record.payload,
  };
  delete payload.base_currency;
  return {
    ...record,
    apiVersion: 1,
    baseCurrency: 'TWD',
    moneyScale: 2,
    payload: payload as PendingExpense['payload'],
  };
}

/** Writes a v1 C row the way a release before B5d-1 did; the current store refuses to. */
export async function insertLegacyPending(
  db: SqlDatabase,
  record: PendingScope & {
    tripId: string;
    payload: { client_request_id: string };
    status?: PendingStatus;
    createdAt?: number;
  }
) {
  await db.runAsync(
    `INSERT INTO pending_expense (environment, account_id, client_request_id, trip_id, payload, status, created_at, updated_at, api_version, base_currency, money_scale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'TWD', 2)`,
    record.environment,
    record.accountId,
    record.payload.client_request_id,
    record.tripId,
    JSON.stringify(record.payload),
    record.status ?? 'unconfirmed',
    record.createdAt ?? 1000,
    record.createdAt ?? 1000
  );
}
