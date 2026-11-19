import { defineConfig } from 'vitest/config';
import base from './vitest.config';

if (!process.env.MONGODB_MEMBER_TEST_URI || process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES !== '1') {
  throw new Error(
    'Set MONGODB_MEMBER_TEST_URI and MONGODB_MEMBER_TEST_ALLOW_WRITES=1 for an isolated replica set.'
  );
}

// These suites share the member DB opt-in and create their own temporary databases.
const suites = [
  'accountEmail',
  'accountEntry',
  'accountPassword',
  'accountProfile',
  'avatarWrite',
  'budgetRead',
  'expenseMaintenance',
  'expenseSearch',
  'friends',
  'itineraryBatchDelete',
  'itineraryWrite',
  'ledger',
  'memberIdentity',
  'memberManagement',
  'mobileExpenseWrite',
  'paymentWrite',
  'receiptRead',
  'receiptWrite',
  'tripAccess',
  'tripCurrencyManagement',
  'tripEffects',
  'tripEntry',
  'tripManagement',
  'tripWriters',
  'webLedger',
  'webLedgerMaintenance',
];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: suites.map((name) => `src/__tests__/${name}.integration.test.ts`),
    maxWorkers: 2,
  },
});
