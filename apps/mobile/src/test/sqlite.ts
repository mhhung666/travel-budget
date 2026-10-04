import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase } from '@/storage/pendingExpenses';

/** A throwaway SQLite database behind the same async interface expo-sqlite offers. */
export function memoryDatabase(path = ':memory:'): SqlDatabase & { close(): void } {
  const db = new DatabaseSync(path);
  return {
    execAsync: async (source) => db.exec(source),
    runAsync: async (source, ...params) => db.prepare(source).run(...params),
    getAllAsync: async <T>(source: string, ...params: (string | number | null)[]) =>
      db.prepare(source).all(...params) as T[],
    getFirstAsync: async <T>(source: string, ...params: (string | number | null)[]) =>
      (db.prepare(source).get(...params) ?? null) as T | null,
    close: () => db.close(),
  };
}
