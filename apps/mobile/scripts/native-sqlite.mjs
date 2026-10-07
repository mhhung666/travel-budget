import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const triggers = [
  'save',
  'discard',
  'enqueue',
  'prepare',
  'cleanup',
  'snapshot',
  'mutation_save',
  'mutation_complete',
];
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

/** E mutations can have no trip yet; account deadlines also outlive individual trip rows. */
export function nativeCheckpointSql(table, scope) {
  assert(
    [
      'expense_draft',
      'draft_trip',
      'expense_queue',
      'pending_expense',
      'pending_mutation',
      'expense_rate_limit',
    ].includes(table),
    'Unsupported checkpoint table'
  );
  const filters = { environment: scope.environment, account_id: scope.accountId };
  if (!['pending_mutation', 'expense_rate_limit'].includes(table)) filters.trip_id = scope.tripId;
  const where = Object.entries(filters)
    .map(([key, value]) => `${key} = ${literal(value)}`)
    .join(' AND ');
  return `SELECT * FROM ${table} WHERE ${where};`;
}

/** Locate the device DB even when E1 has only a tripless request or an account deadline. */
export function nativeDatabaseMatchSql(scope) {
  const counts = [
    'expense_draft',
    'draft_trip',
    'pending_expense',
    'expense_queue',
    'pending_mutation',
    'expense_rate_limit',
  ].map((table) => `(SELECT count(*) FROM (${nativeCheckpointSql(table, scope).slice(0, -1)}))`);
  return `SELECT ${counts.join(' + ')};`;
}

/** Scoped test triggers fail the device's real SQLite statements; no application fault switch. */
export function nativeFaultSql(command, scope) {
  if (command === 'sqlite-clear')
    return triggers.map((name) => `DROP TRIGGER IF EXISTS tb_native_${name};`).join('\n');
  if (/^sqlite-mutation-(save|complete)-fail$/.test(command))
    return nativeMutationFaultSql(command, scope);
  const name = command.match(/^sqlite-(save|discard|enqueue|prepare|cleanup|snapshot)-fail$/)?.[1];
  assert(name, 'Unknown native SQLite fault');
  const operations = {
    save: ['UPDATE OF input', 'expense_draft', 'NEW', "NEW.status = 'editing'"],
    discard: ['UPDATE OF status', 'expense_draft', 'NEW', "NEW.status = 'discarded'"],
    enqueue: ['INSERT', 'expense_queue', 'NEW', '1'],
    prepare: ['INSERT', 'pending_expense', 'NEW', '1'],
    cleanup: ['DELETE', 'pending_expense', 'OLD', '1'],
    snapshot: ['UPDATE OF options', 'draft_trip', 'NEW', '1'],
  };
  const [operation, table, row, extra] = operations[name];
  const where = Object.entries({
    environment: scope.environment,
    account_id: scope.accountId,
    trip_id: scope.tripId,
  })
    .map(([key, value]) => `${row}.${key} = ${literal(value)}`)
    .join(' AND ');
  return `CREATE TRIGGER IF NOT EXISTS tb_native_${name} BEFORE ${operation} ON ${table}
    WHEN ${where} AND ${extra} BEGIN SELECT RAISE(FAIL, 'TB_NATIVE_SQLITE_${name}'); END;`;
}

/** Fail E persistence in the selected native account/environment without touching C/D rows. */
export function nativeMutationFaultSql(command, scope) {
  const action = command.match(/^sqlite-mutation-(save|complete)-fail$/)?.[1];
  assert(action, 'Unknown native mutation fault');
  const row = 'NEW';
  const where = `${row}.environment = ${literal(scope.environment)} AND ${row}.account_id = ${literal(scope.accountId)}`;
  return `CREATE TRIGGER IF NOT EXISTS tb_native_mutation_${action} BEFORE ${action === 'save' ? 'INSERT' : 'UPDATE OF status'} ON pending_mutation
    WHEN ${where} ${action === 'complete' ? "AND NEW.status = 'completed'" : ''}
    BEGIN SELECT RAISE(FAIL, 'TB_NATIVE_MUTATION_${action}'); END;`;
}

/** Remove only disposable fixture records after an unresolved-conflict measurement. */
export function nativeCaseResetSql(scope) {
  const where = Object.entries({
    environment: scope.environment,
    account_id: scope.accountId,
    trip_id: scope.tripId,
  })
    .map(([key, value]) => `${key} = ${literal(value)}`)
    .join(' AND ');
  return [
    'BEGIN IMMEDIATE;',
    ...['pending_expense', 'expense_queue', 'expense_draft', 'draft_trip'].map(
      (table) => `DELETE FROM ${table} WHERE ${where};`
    ),
    'COMMIT;',
  ].join('\n');
}

async function findDatabase(root, matches) {
  const found = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'travel-budget-pending.db') found.push(path);
    }
  }
  await walk(root);
  const matching = found.filter(matches);
  assert.equal(matching.length, 1, 'Expected one SQLite database containing this fixture scope');
  return matching[0];
}
export async function createNativeSqliteControl(platform, device, scope, artifacts) {
  const run = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let execute;
  let openFailure;
  let restoreOpen;
  let stopApp;
  if (platform === 'ios') {
    const container = run('xcrun', [
      'simctl',
      'get_app_container',
      device,
      'host.exp.Exponent',
      'data',
    ]);
    const path = await findDatabase(
      join(container, 'Documents', 'ExponentExperienceData'),
      (candidate) => {
        try {
          return Number(run('sqlite3', [candidate, nativeDatabaseMatchSql(scope)])) > 0;
        } catch {
          return false;
        }
      }
    );
    execute = (sql) => run('sqlite3', ['-json', path, sql]);
    const backups = [];
    let blocked = false;
    const stop = () => run('xcrun', ['simctl', 'terminate', device, 'host.exp.Exponent']);
    stopApp = stop;
    openFailure = async () => {
      assert.equal(backups.length, 0, 'SQLite open fault is already armed');
      stop();
      for (const suffix of ['', '-wal', '-shm']) {
        const original = path + suffix;
        try {
          await rename(original, original + '.tb-native');
          backups.push(original);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      await mkdir(path, { mode: 0o700 });
      blocked = true;
    };
    restoreOpen = async () => {
      if (!backups.length) return;
      // The failed open may have left Expo Go running. Stop before restoring the saved files.
      try {
        stop();
      } catch {
        /* already stopped by the native flow */
      }
      if (blocked) {
        await rmdir(path);
        blocked = false;
      }
      for (const original of backups) await rename(original + '.tb-native', original);
      backups.length = 0;
    };
  } else {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const adb = sdk ? join(sdk, 'platform-tools', 'adb') : 'adb';
    const path = run(adb, [
      '-s',
      device,
      'shell',
      'find',
      '/data/data/host.exp.exponent',
      '-name',
      'travel-budget-pending.db',
    ]);
    assert(
      /^\/data\/data\/host\.exp\.exponent\/[a-zA-Z0-9_./@-]+$/.test(path),
      'Expected one initialized Expo Go database; Android emulator must allow adb root'
    );
    execute = (sql) =>
      run(adb, ['-s', device, 'shell', 'sqlite3', '-json', shellQuote(path), shellQuote(sql)]);
    const shell = (...args) => run(adb, ['-s', device, 'shell', ...args]);
    const backups = [];
    let blocked = false;
    stopApp = () => shell('am', 'force-stop', 'host.exp.exponent');
    openFailure = async () => {
      assert.equal(backups.length, 0, 'SQLite open fault is already armed');
      shell('am', 'force-stop', 'host.exp.exponent');
      for (const suffix of ['', '-wal', '-shm']) {
        const original = path + suffix;
        if (
          shell(
            'if',
            'test',
            '-f',
            shellQuote(original),
            ';',
            'then',
            'echo',
            'present',
            ';',
            'fi'
          ) !== 'present'
        )
          continue;
        shell('mv', shellQuote(original), shellQuote(original + '.tb-native'));
        backups.push(original);
      }
      shell('mkdir', shellQuote(path));
      blocked = true;
    };
    restoreOpen = async () => {
      if (!backups.length) return;
      shell('am', 'force-stop', 'host.exp.exponent');
      if (blocked) {
        shell('rmdir', shellQuote(path));
        blocked = false;
      }
      for (const original of backups)
        shell('mv', shellQuote(original + '.tb-native'), shellQuote(original));
      backups.length = 0;
    };
  }
  let armed = false;
  return {
    async command(command) {
      if (command === 'sqlite-reset-case') {
        try {
          stopApp();
        } catch (error) {
          if (
            !/not running|found no process|No such process|found nothing to terminate/i.test(
              String(error.stderr)
            )
          )
            throw error;
        }
        execute(nativeCaseResetSql(scope));
        return { fixtureCaseCleared: true };
      }
      if (command === 'sqlite-open-fail') {
        await openFailure();
        return { fault: command };
      }
      if (command === 'sqlite-clear') await restoreOpen();
      const checkpoint = command.match(/^sqlite-checkpoint-([a-z0-9-]+)$/)?.[1];
      if (checkpoint) {
        const state = {};
        state.capturedAt = Date.now();
        for (const table of [
          'expense_draft',
          'draft_trip',
          'expense_queue',
          'pending_expense',
          'pending_mutation',
          'expense_rate_limit',
        ])
          state[table] = JSON.parse(execute(nativeCheckpointSql(table, scope)) || '[]');
        await writeFile(
          join(artifacts, `sqlite-${checkpoint}.json`),
          JSON.stringify(state, null, 2) + '\n',
          { mode: 0o600 }
        );
        return { checkpoint };
      }
      execute(nativeFaultSql(command, scope));
      armed = command !== 'sqlite-clear';
      return { fault: command };
    },
    async close() {
      await restoreOpen();
      if (armed) execute(nativeFaultSql('sqlite-clear', scope));
    },
  };
}
