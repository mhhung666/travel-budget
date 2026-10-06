// _id = actor:normalized UUID provides the account-wide unique constraint; no TTL.
export async function up(db) {
  await db.collection('mutationrequests').createIndex({ 'terminal.resourceId': 1 }, { name: 'mutation_resource' });
  await db.collection('trips').createIndex({ hashCode: 1 }, { unique: true, name: 'hashCode_1' });
}
export async function down(db) {
  await db.collection('mutationrequests').dropIndex('mutation_resource').catch(error => { if (error.codeName !== 'IndexNotFound' && error.codeName !== 'NamespaceNotFound') throw error; });
  // Preserve the existing unique trip invitation index and durable receipts on rollback.
}
