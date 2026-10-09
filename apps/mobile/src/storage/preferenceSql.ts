import type { SqlDatabase } from './pendingExpenses';
import type { PreferenceStorage } from '@/features/preferences/store';

export async function createPreferenceStorage(db: SqlDatabase): Promise<PreferenceStorage> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS device_preferences (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)'
  );
  return {
    read: async () =>
      (
        await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM device_preferences WHERE id = 1'
        )
      )?.value ?? null,
    write: async (value) => {
      await db.runAsync(
        'INSERT INTO device_preferences (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
        value
      );
    },
  };
}
