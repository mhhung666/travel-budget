import { config } from 'dotenv';
import mongoose from 'mongoose';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const INDEX_NAME = 'splits.user_1_date_-1__id_-1';
const PAGE_SIZE = 20;

function readOption(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function collectPlanDetails(value, details = { stages: new Set(), indexes: new Set() }) {
  if (!value || typeof value !== 'object') return details;
  if (typeof value.stage === 'string') details.stages.add(value.stage);
  if (typeof value.indexName === 'string') details.indexes.add(value.indexName);
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$')) details.stages.add(key);
    collectPlanDetails(child, details);
  }
  return details;
}

function findExecutionStats(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.totalDocsExamined === 'number' && typeof value.totalKeysExamined === 'number') {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findExecutionStats(child);
    if (result) return result;
  }
  return null;
}

function summarize(label, explain, rows, elapsedMs) {
  // Do not inspect explain.command.pipeline: it echoes the requested $sort even
  // when the planner absorbed that sort into an index scan.
  const planRoots = [explain.stages, explain.queryPlanner, explain.executionStats].filter(Boolean);
  const details = { stages: new Set(), indexes: new Set() };
  for (const root of planRoots) collectPlanDetails(root, details);
  const execution = findExecutionStats(explain.executionStats ?? explain.stages);
  const { stages, indexes } = details;
  const stageList = [...stages];
  return {
    query: label,
    indexes: [...indexes],
    stages: stageList,
    returned: rows.length,
    responseBytes: Buffer.byteLength(JSON.stringify(rows)),
    elapsedMs,
    docsExamined: execution?.totalDocsExamined ?? null,
    keysExamined: execution?.totalKeysExamined ?? null,
    collectionScan: stageList.includes('COLLSCAN'),
    blockingSort: stageList.includes('SORT') || stageList.includes('$sort'),
  };
}

const uri = process.env.MONGODB_URI;
const user = readOption('user') || process.env.STATS_EXPLAIN_USER_ID;
const trip = readOption('trip');

if (!uri) {
  throw new Error('MONGODB_URI is required. Define it in .env.local, .env, or the environment.');
}
if (!user || !mongoose.isObjectIdOrHexString(user)) {
  throw new Error('Pass a valid --user <ObjectId> or set STATS_EXPLAIN_USER_ID.');
}
if (trip && !mongoose.isObjectIdOrHexString(trip)) {
  throw new Error('--trip must be a valid ObjectId.');
}

await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB || undefined,
  autoIndex: false,
});

try {
  const expenses = mongoose.connection.collection('expenses');
  const indexes = await expenses.indexes();
  const hasExpectedIndex = indexes.some((index) => index.name === INDEX_NAME);
  const userId = new mongoose.Types.ObjectId(user);
  const match = {
    'splits.user': userId,
    ...(trip ? { trip: new mongoose.Types.ObjectId(trip) } : {}),
  };
  const splitMatch = { 'splits.user': userId };
  const queries = [
    {
      label: 'dateDesc',
      pipeline: [
        { $match: match },
        { $sort: { date: -1, _id: -1 } },
        { $limit: PAGE_SIZE + 1 },
        { $unwind: '$splits' },
        { $match: splitMatch },
      ],
    },
    {
      label: 'amountDesc',
      pipeline: [
        { $match: match },
        { $unwind: '$splits' },
        { $match: splitMatch },
        { $sort: { 'splits.shareAmount': -1, _id: -1 } },
        { $limit: PAGE_SIZE + 1 },
      ],
    },
  ];

  const summaries = [];
  for (const query of queries) {
    const explain = await expenses.aggregate(query.pipeline).explain('executionStats');
    const startedAt = performance.now();
    const rows = await expenses.aggregate(query.pipeline).toArray();
    const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
    summaries.push(summarize(query.label, explain, rows, elapsedMs));
  }

  console.log(
    JSON.stringify(
      {
        collection: expenses.collectionName,
        expectedIndex: INDEX_NAME,
        expectedIndexPresent: hasExpectedIndex,
        note: 'amountDesc is expected to use a blocking sort after the split array is unwound.',
        results: summaries,
      },
      null,
      2
    )
  );

  if (!hasExpectedIndex) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
