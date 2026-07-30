import { config } from 'dotenv';
import mongoose from 'mongoose';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const INDEX_NAME = 'splits.user_1_date_-1__id_-1';
const DEFAULT_SIZES = [500, 2_000, 10_000];
const PAGE_SIZE = 20;
const RUNS = 5;
const CATEGORIES = [
  'accommodation',
  'transportation',
  'food',
  'shopping',
  'entertainment',
  'tickets',
  'other',
];
const TAGS = ['family', 'business', 'ski', 'souvenir', 'festival'];

function readOption(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseSizes(value) {
  if (!value) return DEFAULT_SIZES;
  const sizes = value.split(',').map((item) => Number(item.trim()));
  if (!sizes.length || sizes.some((size) => !Number.isSafeInteger(size) || size <= 0)) {
    throw new Error('--sizes must be a comma-separated list of positive integers.');
  }
  return [...new Set(sizes)].sort((a, b) => a - b);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function timing(values) {
  return {
    medianMs: Math.round(percentile(values, 0.5) * 10) / 10,
    p95Ms: Math.round(percentile(values, 0.95) * 10) / 10,
  };
}

async function measure(operation) {
  await operation();
  const elapsed = [];
  let result;
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    result = await operation();
    elapsed.push(performance.now() - startedAt);
  }
  return { result, ...timing(elapsed) };
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

function planSummary(explain) {
  const roots = [explain.stages, explain.queryPlanner, explain.executionStats].filter(Boolean);
  const details = { stages: new Set(), indexes: new Set() };
  for (const root of roots) collectPlanDetails(root, details);
  const execution = findExecutionStats(explain.executionStats ?? explain.stages);
  const stages = [...details.stages];
  return {
    indexes: [...details.indexes],
    stages,
    docsExamined: execution?.totalDocsExamined ?? null,
    keysExamined: execution?.totalKeysExamined ?? null,
    collectionScan: stages.includes('COLLSCAN'),
    blockingSort: stages.includes('SORT') || stages.includes('$sort'),
  };
}

function syntheticTrips(userId, count, seed) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const _id = new mongoose.Types.ObjectId();
    const startDate = new Date(Date.UTC(2024 + (index % 3), index % 12, 1));
    return {
      _id,
      name: `Benchmark trip ${index + 1}`,
      description: '',
      startDate,
      endDate: new Date(startDate.getTime() + 7 * 86_400_000),
      hashCode: `benchmark-${seed}-${index}`,
      members: [{ user: userId, role: 'admin', joinedAt: now, archivedAt: null }],
      budget: null,
      currencySettings: null,
      createdAt: now,
    };
  });
}

function syntheticExpense(index, tripIds, userId, secondaryUserId) {
  const amount = ((index * 7_919) % 45_000) + 100;
  const primaryShare = Math.round(amount * (index % 5 === 0 ? 0.6 : 1));
  const date = new Date(Date.UTC(2024, 0, 1 + (index % 730)));
  const tags =
    index % 4 === 0 ? [TAGS[index % TAGS.length]] : index % 11 === 0 ? [TAGS[1], TAGS[3]] : [];
  return {
    trip: tripIds[index % tripIds.length],
    payer: index % 5 === 0 ? secondaryUserId : userId,
    amount,
    originalAmount: amount,
    currency: 'TWD',
    exchangeRate: 1,
    description: `Synthetic expense ${index + 1}`,
    category: CATEGORIES[index % CATEGORIES.length],
    date,
    splits:
      index % 5 === 0
        ? [
            { user: userId, shareAmount: primaryShare },
            { user: secondaryUserId, shareAmount: amount - primaryShare },
          ]
        : [{ user: userId, shareAmount: primaryShare }],
    attachments: [],
    itineraryDays: [],
    createdBy: userId,
    tags,
    createdAt: date,
  };
}

async function insertInChunks(collection, documents, chunkSize = 1_000) {
  for (let offset = 0; offset < documents.length; offset += chunkSize) {
    await collection.insertMany(documents.slice(offset, offset + chunkSize), {
      ordered: false,
    });
  }
}

function computeDashboard(expenses, userId) {
  const categoryTotals = new Map();
  const tripTotals = new Map();
  const tagTotals = new Map();
  const timeline = new Map();
  let totalAmount = 0;

  for (const expense of expenses) {
    const split = expense.splits.find((item) => item.user.equals(userId));
    if (!split) continue;
    const amount = split.shareAmount;
    totalAmount += amount;
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + amount);
    tripTotals.set(String(expense.trip), (tripTotals.get(String(expense.trip)) ?? 0) + amount);
    for (const tag of expense.tags ?? []) {
      tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + amount);
    }
    const day = expense.date.toISOString().slice(0, 10);
    timeline.set(day, (timeline.get(day) ?? 0) + amount);
  }

  return {
    totalAmount,
    totalExpenses: expenses.length,
    categories: categoryTotals.size,
    trips: tripTotals.size,
    tags: tagTotals.size,
    days: timeline.size,
  };
}

async function benchmarkSize({ db, size, userId, secondaryUserId }) {
  const trips = db.collection('trips');
  const expenses = db.collection('expenses');
  await Promise.all([trips.deleteMany({}), expenses.deleteMany({})]);

  const tripCount = Math.min(100, Math.max(5, Math.ceil(size / 100)));
  const tripDocuments = syntheticTrips(userId, tripCount, size);
  await trips.insertMany(tripDocuments);
  await insertInChunks(
    expenses,
    Array.from({ length: size }, (_, index) =>
      syntheticExpense(
        index,
        tripDocuments.map((trip) => trip._id),
        userId,
        secondaryUserId
      )
    )
  );

  const tripResult = await measure(() =>
    trips.find({ 'members.user': userId }).project({ _id: 1, name: 1 }).toArray()
  );
  const tripIds = tripResult.result.map((trip) => trip._id);
  const dashboardMatch = { trip: { $in: tripIds }, 'splits.user': userId };
  const dashboardProjection = {
    category: 1,
    date: 1,
    description: 1,
    splits: 1,
    trip: 1,
    tags: 1,
  };
  const dashboardExplain = await expenses
    .find(dashboardMatch)
    .project(dashboardProjection)
    .explain('executionStats');
  const dashboardFetch = await measure(() =>
    expenses.find(dashboardMatch).project(dashboardProjection).toArray()
  );
  const dashboardCompute = await measure(() =>
    Promise.resolve(computeDashboard(dashboardFetch.result, userId))
  );

  const datePipeline = [
    { $match: { 'splits.user': userId } },
    { $sort: { date: -1, _id: -1 } },
    { $limit: PAGE_SIZE + 1 },
    { $unwind: '$splits' },
    { $match: { 'splits.user': userId } },
  ];
  const amountPipeline = [
    { $match: { 'splits.user': userId } },
    { $unwind: '$splits' },
    { $match: { 'splits.user': userId } },
    { $sort: { 'splits.shareAmount': -1, _id: -1 } },
    { $limit: PAGE_SIZE + 1 },
  ];
  const dateExplain = await expenses.aggregate(datePipeline).explain('executionStats');
  const amountExplain = await expenses.aggregate(amountPipeline).explain('executionStats');
  const dateResult = await measure(() => expenses.aggregate(datePipeline).toArray());
  const amountResult = await measure(() => expenses.aggregate(amountPipeline).toArray());

  return {
    expenses: size,
    trips: tripCount,
    dashboard: {
      tripLookup: { medianMs: tripResult.medianMs, p95Ms: tripResult.p95Ms },
      fetch: {
        medianMs: dashboardFetch.medianMs,
        p95Ms: dashboardFetch.p95Ms,
        documents: dashboardFetch.result.length,
        responseBytes: Buffer.byteLength(JSON.stringify(dashboardFetch.result)),
        ...planSummary(dashboardExplain),
      },
      serverCompute: {
        medianMs: dashboardCompute.medianMs,
        p95Ms: dashboardCompute.p95Ms,
      },
    },
    details: {
      dateDesc: {
        medianMs: dateResult.medianMs,
        p95Ms: dateResult.p95Ms,
        returned: dateResult.result.length,
        responseBytes: Buffer.byteLength(JSON.stringify(dateResult.result)),
        ...planSummary(dateExplain),
      },
      amountDesc: {
        medianMs: amountResult.medianMs,
        p95Ms: amountResult.p95Ms,
        returned: amountResult.result.length,
        responseBytes: Buffer.byteLength(JSON.stringify(amountResult.result)),
        ...planSummary(amountExplain),
      },
    },
  };
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is required. Define it in .env.local, .env, or the environment.');
}

const sourceConnection = await mongoose
  .createConnection(uri, {
    dbName: process.env.MONGODB_DB || undefined,
    autoIndex: false,
  })
  .asPromise();
const sourceDatabase = sourceConnection.name;
await sourceConnection.close();

const benchmarkDatabase =
  readOption('db') || process.env.STATS_BENCHMARK_DB || `${sourceDatabase}-benchmark`;
if (benchmarkDatabase === sourceDatabase || !/(benchmark|bench|test)/i.test(benchmarkDatabase)) {
  throw new Error(
    `Refusing to use database "${benchmarkDatabase}". Choose a separate name containing benchmark, bench, or test.`
  );
}

const sizes = parseSizes(readOption('sizes'));
const keepDatabase = hasFlag('keep');
const connection = await mongoose
  .createConnection(uri, {
    dbName: benchmarkDatabase,
    autoIndex: false,
  })
  .asPromise();
const db = connection.db;

try {
  await db.dropDatabase();
  await Promise.all([
    db.collection('trips').createIndex({ 'members.user': 1 }, { name: 'members.user_1' }),
    db
      .collection('expenses')
      .createIndex({ 'splits.user': 1, date: -1, _id: -1 }, { name: INDEX_NAME }),
  ]);

  const userId = new mongoose.Types.ObjectId();
  const secondaryUserId = new mongoose.Types.ObjectId();
  const results = [];
  for (const size of sizes) {
    results.push(await benchmarkSize({ db, size, userId, secondaryUserId }));
  }

  console.log(
    JSON.stringify(
      {
        sourceDatabase,
        benchmarkDatabase,
        syntheticDataOnly: true,
        runsPerQuery: RUNS,
        expectedIndex: INDEX_NAME,
        databaseRetained: keepDatabase,
        results,
      },
      null,
      2
    )
  );
} finally {
  if (!keepDatabase) await db.dropDatabase();
  await connection.close();
}
