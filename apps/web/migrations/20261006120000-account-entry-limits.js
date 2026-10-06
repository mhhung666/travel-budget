export async function up(db) {
  await db
    .collection('accountentryattempts')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('passwordresetcodes').createIndex({ user: 1 }, { unique: true });
  await db
    .collection('passwordresetcodes')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
export async function down(db) {
  await db
    .collection('accountentryattempts')
    .dropIndex('expiresAt_1')
    .catch((error) => {
      if (error.code !== 27 && error.code !== 26) throw error;
    });
  // Preserve existing reset-code indexes and data; rollback must not reactivate a consumed code.
}
