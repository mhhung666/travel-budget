import type { RequestOptions } from './client';

type Version = NonNullable<RequestOptions['apiVersion']>;

/**
 * The only places a request leaves the client's v2 default. An operation saved by an older release
 * is resumed on the wire version it was created with; a record is never relabelled by a newer
 * release or by the configured environment.
 */

/** C expense records: a record from before `apiVersion` existed is v2 only if its body says so. */
export const savedExpenseVersion = (record: { apiVersion?: Version; payload: object }): Version =>
  record.apiVersion ?? ('base_currency' in record.payload ? 2 : 1);

/** E mutation records: an unlabelled record predates v2. */
export const savedMutationVersion = (record: { apiVersion?: Version }): Version =>
  record.apiVersion ?? 1;

/** D queued expenses keep their v1 envelope until B5c-2 moves the queue. */
export const QUEUED_EXPENSE_VERSION: Version = 1;
