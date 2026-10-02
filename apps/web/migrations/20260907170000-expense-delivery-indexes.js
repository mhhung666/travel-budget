/** Additive outbox rollout. Never auto-run from a request or during build. */
const INDEXES = [
  {
    collection: 'expenses',
    name: 'expense_delivery_ready',
    key: { 'expenseDelivery.status': 1, 'expenseDelivery.availableAt': 1 },
  },
  {
    collection: 'notifications',
    name: 'expense_event_recipient_unique',
    key: { deliveryEventKey: 1, user: 1 },
    unique: true,
    partialFilterExpression: { deliveryEventKey: { $type: 'string' } },
  },
  {
    collection: 'activitylogs',
    name: 'expense_event_unique',
    key: { deliveryEventKey: 1 },
    unique: true,
    partialFilterExpression: { deliveryEventKey: { $type: 'string' } },
  },
  { collection: 'pushsubscriptions', name: 'expense_push_candidates', key: { user: 1, _id: 1 } },
];

export async function up(db) {
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid')
    throw new Error('Expense delivery requires transactions');
  const plans = [];
  // Refuse conflicting definitions before any DDL; unique build itself rejects duplicate data.
  for (const definition of INDEXES) {
    let indexes;
    try {
      indexes = await db.collection(definition.collection).listIndexes().toArray();
    } catch (error) {
      if (error.code !== 26) throw error;
      indexes = [];
    }
    const existing = indexes.find((index) => index.name === definition.name);
    if (
      existing &&
      (JSON.stringify(existing.key) !== JSON.stringify(definition.key) ||
        Boolean(existing.unique) !== Boolean(definition.unique) ||
        JSON.stringify(existing.partialFilterExpression) !==
          JSON.stringify(definition.partialFilterExpression) ||
        existing.sparse ||
        existing.hidden ||
        existing.expireAfterSeconds !== undefined ||
        (existing.collation && existing.collation.locale !== 'simple'))
    )
      throw new Error(`Incompatible expense delivery index: ${definition.name}`);
    if (!existing) plans.push(definition);
  }
  for (const { collection, key, ...options } of plans)
    await db
      .collection(collection)
      .createIndex(key, { ...options, collation: { locale: 'simple' } });
}

export async function down() {
  // These indexes protect already persisted events. Rolling code back must not remove deduplication.
  throw new Error(
    'Forward-only migration: disable new outbox writes and drain jobs; retain delivery indexes'
  );
}
