/** Only traverse executed/winning plans, never echoed commands or rejected plans. */
export function summarizeExplain(explain) {
  const stages = new Set();
  const indexes = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.stage === 'string') stages.add(value.stage);
    if (typeof value.indexName === 'string') indexes.add(value.indexName);
    for (const [key, child] of Object.entries(value)) {
      if (['rejectedPlans', 'allPlansExecution', 'command', 'parsedQuery'].includes(key)) continue;
      if (key.startsWith('$') && key !== '$cursor') stages.add(key);
      walk(child);
    }
  }
  walk(explain.queryPlanner?.winningPlan);
  walk(explain.executionStats?.executionStages);
  for (const stage of explain.stages ?? []) {
    if (stage.$cursor) {
      walk(stage.$cursor.queryPlanner?.winningPlan);
      walk(stage.$cursor.executionStats?.executionStages);
    } else walk(stage);
  }
  const stats =
    explain.executionStats ?? explain.stages?.find((s) => s.$cursor)?.$cursor.executionStats;
  // Sharded aggregation needs separate per-shard reporting, not one arbitrary shard's totals.
  const shards = explain.shards ? Object.values(explain.shards).map(summarizeExplain) : [];
  for (const shard of shards) {
    shard.stages.forEach((s) => stages.add(s));
    shard.indexes.forEach((s) => indexes.add(s));
  }
  const lastStage = explain.stages?.at(-1);
  return {
    nReturned: lastStage?.nReturned ?? stats?.nReturned ?? null,
    totalDocsExamined: stats?.totalDocsExamined ?? null,
    totalKeysExamined: stats?.totalKeysExamined ?? null,
    executionTimeMillis: stats?.executionTimeMillis ?? null,
    stages: [...stages].sort(),
    indexes: [...indexes].sort(),
    collectionScan: stages.has('COLLSCAN'),
    blockingSort: stages.has('SORT') || stages.has('$sort'),
    ...(shards.length ? { shards } : {}),
  };
}

export const ACCOUNT_COLLATION = { locale: 'en', strength: 2 };

// Deliberately not imported by models: candidates must not be built by autoIndex.
export const CANDIDATE_INDEXES = [
  {
    collection: 'expenses',
    key: { trip: 1, date: -1, createdAt: -1 },
    name: 'trip_1_date_-1_createdAt_-1',
  },
  { collection: 'expenses', key: { createdAt: 1 }, name: 'createdAt_1' },
  { collection: 'payments', key: { trip: 1, createdAt: -1 }, name: 'trip_1_createdAt_-1' },
  { collection: 'checklists', key: { trip: 1, createdAt: 1 }, name: 'trip_1_createdAt_1' },
  {
    collection: 'photos',
    key: { trip: 1, takenAt: -1, createdAt: -1 },
    name: 'trip_1_takenAt_-1_createdAt_-1',
  },
  ...['username', 'email'].map((field) => ({
    collection: 'users',
    key: { [field]: 1 },
    name: `${field}_ci_unique`,
    unique: true,
    collation: ACCOUNT_COLLATION,
  })),
];

export function coreQueries({ trip, since, username, email }) {
  return [
    {
      name: 'expenses.list',
      collection: 'expenses',
      filter: { trip },
      sort: { date: -1, createdAt: -1 },
    },
    {
      name: 'expenses.digest',
      collection: 'expenses',
      filter: { createdAt: { $gte: since } },
      projection: { trip: 1, amount: 1, description: 1, createdBy: 1, payer: 1 },
    },
    {
      name: 'expenses.settlement',
      collection: 'expenses',
      filter: { trip },
      projection: { payer: 1, amount: 1, splits: 1 },
    },
    {
      name: 'payments.list',
      collection: 'payments',
      filter: { trip },
      sort: { createdAt: -1 },
      projection: { from: 1, to: 1, amount: 1, note: 1, createdAt: 1 },
    },
    { name: 'checklists.list', collection: 'checklists', filter: { trip }, sort: { createdAt: 1 } },
    {
      name: 'photos.list',
      collection: 'photos',
      filter: { trip },
      sort: { takenAt: -1, createdAt: -1 },
    },
    {
      name: 'itinerary.list',
      collection: 'itinerarydays',
      filter: { trip },
      sort: { dayNumber: 1 },
    },
    ...Object.entries({ username, email })
      .filter(([, value]) => value)
      .map(([field, value]) => ({
        name: `users.${field}`,
        collection: 'users',
        filter: { [field]: value },
        collation: ACCOUNT_COLLATION,
        limit: 1,
      })),
  ];
}

/** Counts only: don't export account names, addresses, hashes, or document IDs. */
export async function auditAccounts(db, maxTimeMS) {
  const results = {};
  for (const field of ['username', 'email']) {
    const duplicates = await db
      .collection('users')
      .aggregate(
        [
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $group: { _id: null, groups: { $sum: 1 }, documents: { $sum: '$count' } } },
          { $project: { _id: 0 } },
        ],
        { collation: ACCOUNT_COLLATION, maxTimeMS, allowDiskUse: false }
      )
      .toArray();
    const invalid = await db.collection('users').countDocuments(
      {
        $expr: { $ne: [{ $type: `$${field}` }, 'string'] },
      },
      { maxTimeMS }
    );
    results[field] = { ...(duplicates[0] ?? { groups: 0, documents: 0 }), invalid };
  }
  return results;
}
