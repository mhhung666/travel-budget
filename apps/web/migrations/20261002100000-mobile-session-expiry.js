// TTL is cleanup only. Every authenticated request also checks expiry/revocation.
export async function up(db) {
  await db
    .collection('mobilesessions')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'mobile_session_expiry' });
  await db
    .collection('mobileloginattempts')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'mobile_login_expiry' });
}
export async function down(db) {
  for (const [collection, index] of [
    ['mobilesessions', 'mobile_session_expiry'],
    ['mobileloginattempts', 'mobile_login_expiry'],
  ]) {
    try {
      await db.collection(collection).dropIndex(index);
    } catch (error) {
      if (error.code !== 26 && error.code !== 27) throw error;
    }
  }
  // Retain sessions and revocations so rollback cannot reactivate a revoked token.
}
