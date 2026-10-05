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

// File reopen/process-death tests use only these Node APIs; they never enter native bundles.
declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:child_process' {
  export function spawnSync(
    command: string,
    args: string[]
  ): {
    status: number | null;
    stderr: { toString(): string };
  };
}
