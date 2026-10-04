// Node's built-in SQLite, used only by tests to run the pending-expense SQL for real. The app does
// not depend on @types/node, so the few members tests need are declared here.
declare module 'node:sqlite' {
  type Value = string | number | null;
  export class StatementSync {
    run(...params: Value[]): unknown;
    all(...params: Value[]): unknown[];
    get(...params: Value[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
