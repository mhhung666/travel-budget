import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import {
  auditAccounts,
  CANDIDATE_INDEXES,
  coreQueries,
  summarizeExplain,
} from './lib/mongo-explain.mjs';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const { values } = parseArgs({
  options: {
    trip: { type: 'string' },
    since: { type: 'string' },
    dataset: { type: 'string' },
    before: { type: 'string' },
    'max-time-ms': { type: 'string', default: '10000' },
    'audit-accounts': { type: 'boolean', default: false },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(
    'MONGODB_BASELINE_URI=<explicit target> pnpm mongodb:explain --trip <ObjectId> --since <ISO UTC> --dataset <snapshot label> [--audit-accounts] [--before <report.json>] [--max-time-ms 10000]'
  );
  process.exit(0);
}

// Never silently fall back to the application's potentially production URI.
if (!process.env.MONGODB_BASELINE_URI)
  throw new Error('MONGODB_BASELINE_URI is required; app MONGODB_URI is not used.');
if (!/^[a-f0-9]{24}$/i.test(values.trip ?? '')) throw new Error('--trip must be an ObjectId');
if (!values.dataset) throw new Error('--dataset must identify a fixed data snapshot');
if (
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(values.since ?? '') ||
  !Number.isFinite(Date.parse(values.since))
)
  throw new Error('--since must be an ISO UTC timestamp (including milliseconds)');
const maxTimeMS = Number(values['max-time-ms']);
if (!Number.isInteger(maxTimeMS) || maxTimeMS < 1 || maxTimeMS > 60000)
  throw new Error('--max-time-ms must be 1–60000');
const queries = coreQueries({
  trip: new mongoose.Types.ObjectId(values.trip),
  since: new Date(values.since),
  username: process.env.MONGODB_BASELINE_USERNAME,
  email: process.env.MONGODB_BASELINE_EMAIL,
});
const fingerprint = createHash('sha256')
  .update(JSON.stringify({ dataset: values.dataset, queries }))
  .digest('hex');
const before = values.before ? JSON.parse(await readFile(values.before, 'utf8')) : null;
if (before && (before.format !== 1 || before.fingerprint !== fingerprint))
  throw new Error('Before report uses a different dataset/query shape; comparison refused.');

try {
  await mongoose.connect(process.env.MONGODB_BASELINE_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: maxTimeMS,
  });
  const db = mongoose.connection.db;
  const indexes = {};
  for (const name of new Set([
    ...queries.map((q) => q.collection),
    ...(values['audit-accounts'] ? ['users'] : []),
  ])) {
    const definitions = await db
      .collection(name)
      .listIndexes({ maxTimeMS })
      .toArray()
      .catch((error) => {
        if (error.code === 26) return []; // NamespaceNotFound: do not create empty collections.
        throw error;
      });
    indexes[name] = definitions.map(({ name, key, unique, sparse, collation, hidden }) => ({
      name,
      key,
      unique,
      sparse,
      collation,
      hidden,
    }));
  }
  const results = [];
  for (const query of queries) {
    const command = {
      find: query.collection,
      filter: query.filter,
      maxTimeMS,
      ...(query.sort ? { sort: query.sort } : {}),
      ...(query.projection ? { projection: query.projection } : {}),
      ...(query.collation ? { collation: query.collation } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    };
    const explain = await db.command({ explain: command, verbosity: 'executionStats', maxTimeMS });
    const result = { query: query.name, ...summarizeExplain(explain) };
    const previous = before?.results.find((r) => r.query === query.name);
    if (previous)
      result.delta = Object.fromEntries(
        ['nReturned', 'totalDocsExamined', 'totalKeysExamined', 'executionTimeMillis'].map(
          (key) => [
            key,
            typeof result[key] === 'number' && typeof previous[key] === 'number'
              ? result[key] - previous[key]
              : null,
          ]
        )
      );
    results.push(result);
  }
  const accounts = values['audit-accounts'] ? await auditAccounts(db, maxTimeMS) : undefined;
  console.log(
    JSON.stringify(
      {
        format: 1,
        fingerprint,
        capturedAt: new Date().toISOString(),
        dataset: values.dataset,
        since: values.since,
        maxTimeMS,
        indexes,
        candidates: CANDIDATE_INDEXES,
        results,
        accounts,
        notes: [
          'Read-only executionStats; no rows/credentials exported. No populate, HTTP payload, or TTI measurement.',
          'No hint: measure the winning plan. Empty results are not evidence of index benefit.',
          'Candidate definitions are not installed. Explain bypasses the plan cache; timing is not request latency.',
        ],
      },
      null,
      2
    )
  );
  if (accounts && Object.values(accounts).some((r) => r.groups || r.invalid)) process.exitCode = 2;
} catch (error) {
  // Driver errors can echo connection strings, queries or sensitive values.
  console.error(
    JSON.stringify({
      error: 'MongoDB baseline failed; verify target, permissions, collections and timeout.',
      code: typeof error?.code === 'number' ? error.code : undefined,
    })
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
