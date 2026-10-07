import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  nativeFaultSql,
  nativeCaseResetSql,
  nativeCheckpointSql,
  nativeDatabaseMatchSql,
} from './native-sqlite.mjs';

test('checkpoints include tripless E requests and account deadlines without exposing another scope', () => {
  const db = new DatabaseSync(':memory:');
  const scope = { environment: 'e', accountId: 'a', tripId: 't' };
  try {
    db.exec(`CREATE TABLE pending_mutation(environment,account_id,trip_id);
      INSERT INTO pending_mutation VALUES ('e','a',NULL),('e','a','other'),('e','b',NULL),('other','a',NULL);
      CREATE TABLE expense_rate_limit(environment,account_id,rate_limit_until);
      INSERT INTO expense_rate_limit VALUES ('e','a',120000),('e','b',240000),('other','a',360000);
      CREATE TABLE pending_expense(environment,account_id,trip_id);
      INSERT INTO pending_expense VALUES ('e','a','t'),('e','a','other');`);
    assert.deepEqual(
      db
        .prepare(nativeCheckpointSql('pending_mutation', scope))
        .all()
        .map((r) => r.trip_id),
      [null, 'other']
    );
    assert.deepEqual(
      db
        .prepare(nativeCheckpointSql('expense_rate_limit', scope))
        .all()
        .map((r) => r.rate_limit_until),
      [120000]
    );
    assert.equal(db.prepare(nativeCheckpointSql('pending_expense', scope)).all().length, 1);
    assert.throws(() => nativeCheckpointSql('users', scope), /Unsupported checkpoint table/);
  } finally {
    db.close();
  }
});

test('device fault triggers affect only the selected account, environment and trip and are removable', () => {
  const db = new DatabaseSync(':memory:');
  const scope = { environment: 'http://fixture/api/v1', accountId: 'a', tripId: 't' };
  try {
    db.exec(`CREATE TABLE expense_draft(environment,account_id,trip_id,input,status);
      INSERT INTO expense_draft VALUES ('http://fixture/api/v1','a','t','saved','editing'),
        ('http://fixture/api/v1','b','t','other','editing'),
        ('http://other/api/v1','a','t','other','editing'),
        ('http://fixture/api/v1','a','u','other','editing');`);
    db.exec(nativeFaultSql('sqlite-save-fail', scope));
    assert.throws(
      () =>
        db.exec(
          "UPDATE expense_draft SET input='lost' WHERE account_id='a' AND trip_id='t' AND environment='http://fixture/api/v1'"
        ),
      /TB_NATIVE_SQLITE_save/
    );
    db.exec(
      "UPDATE expense_draft SET input='allowed' WHERE account_id='b' OR trip_id='u' OR environment='http://other/api/v1'"
    );
    assert.equal(
      db
        .prepare(
          "SELECT input FROM expense_draft WHERE account_id='a' AND trip_id='t' AND environment='http://fixture/api/v1'"
        )
        .get().input,
      'saved'
    );
    db.exec(nativeFaultSql('sqlite-discard-fail', scope));
    assert.throws(
      () => db.exec("UPDATE expense_draft SET status='discarded' WHERE input='saved'"),
      /TB_NATIVE_SQLITE_discard/
    );
    db.exec(nativeFaultSql('sqlite-clear', scope));
    db.exec("UPDATE expense_draft SET input='retry', status='discarded' WHERE input='saved'");
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n,
      0
    );
  } finally {
    db.close();
  }
});

test('handoff and cleanup injection fail real SQL without removing the saved or frozen record', () => {
  const db = new DatabaseSync(':memory:');
  const scope = { environment: 'e', accountId: 'a', tripId: 't' };
  try {
    db.exec(`CREATE TABLE pending_expense(environment,account_id,trip_id);
      CREATE TABLE expense_queue(environment,account_id,trip_id);
      CREATE TABLE draft_trip(environment,account_id,trip_id,options);
      INSERT INTO draft_trip VALUES ('e','a','t','saved');`);
    for (const [fault, table] of [
      ['enqueue', 'expense_queue'],
      ['prepare', 'pending_expense'],
    ]) {
      db.exec(nativeFaultSql(`sqlite-${fault}-fail`, scope));
      assert.throws(
        () => db.exec(`INSERT INTO ${table} VALUES ('e','a','t')`),
        new RegExp(`TB_NATIVE_SQLITE_${fault}`)
      );
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
      db.exec(nativeFaultSql('sqlite-clear', scope));
    }
    db.exec("INSERT INTO pending_expense VALUES ('e','a','t')");
    db.exec(nativeFaultSql('sqlite-cleanup-fail', scope));
    assert.throws(() => db.exec('DELETE FROM pending_expense'), /TB_NATIVE_SQLITE_cleanup/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM pending_expense').get().n, 1);
    db.exec(nativeFaultSql('sqlite-snapshot-fail', scope));
    assert.throws(
      () => db.exec("UPDATE draft_trip SET options='new'"),
      /TB_NATIVE_SQLITE_snapshot/
    );
    assert.equal(db.prepare('SELECT options FROM draft_trip').get().options, 'saved');
    db.exec(nativeFaultSql('sqlite-clear', scope));
    db.exec('DELETE FROM pending_expense');
  } finally {
    db.close();
  }
});

test('conflict teardown preserves every other fixture scope', () => {
  const db = new DatabaseSync(':memory:');
  const scope = { environment: 'e', accountId: 'a', tripId: 't' };
  try {
    for (const table of ['pending_expense', 'expense_queue', 'expense_draft', 'draft_trip']) {
      db.exec(`CREATE TABLE ${table}(environment,account_id,trip_id);
        INSERT INTO ${table} VALUES ('e','a','t'),('e','b','t'),('other','a','t'),('e','a','u');`);
    }
    db.exec(nativeCaseResetSql(scope));
    for (const table of ['pending_expense', 'expense_queue', 'expense_draft', 'draft_trip']) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 3);
      assert.equal(
        db
          .prepare(
            `SELECT count(*) AS n FROM ${table} WHERE environment='e' AND account_id='a' AND trip_id='t'`
          )
          .get().n,
        0
      );
    }
  } finally {
    db.close();
  }
});

test('E save and completion faults preserve pending rows and isolate account/environment', () => {
  const db = new DatabaseSync(':memory:');
  const scope = { environment: 'fixture', accountId: 'a', tripId: 't' };
  try {
    db.exec(`CREATE TABLE pending_mutation(environment,account_id,trip_id,status,payload);
      INSERT INTO pending_mutation VALUES ('fixture','a','t','pending','frozen');`);
    db.exec(nativeFaultSql('sqlite-mutation-save-fail', scope));
    assert.throws(
      () => db.exec("INSERT INTO pending_mutation VALUES ('fixture','a',NULL,'pending','trip')"),
      /TB_NATIVE_MUTATION_save/
    );
    db.exec(
      "INSERT INTO pending_mutation VALUES ('fixture','b','t','pending','other'), ('other','a','t','pending','other')"
    );
    db.exec(nativeFaultSql('sqlite-mutation-complete-fail', scope));
    assert.throws(
      () =>
        db.exec(
          "UPDATE pending_mutation SET status='completed',payload=NULL WHERE environment='fixture' AND account_id='a'"
        ),
      /TB_NATIVE_MUTATION_complete/
    );
    assert.equal(
      db
        .prepare(
          "SELECT payload FROM pending_mutation WHERE environment='fixture' AND account_id='a'"
        )
        .get().payload,
      'frozen'
    );
    db.exec(
      "UPDATE pending_mutation SET status='completed' WHERE account_id='b' OR environment='other'"
    );
    db.exec(nativeFaultSql('sqlite-clear', scope));
    db.exec("UPDATE pending_mutation SET status='completed',payload=NULL WHERE account_id='a'");
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n,
      0
    );
  } finally {
    db.close();
  }
});

test('database discovery finds a tripless E1 scope and excludes other accounts and environments', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const table of [
      'expense_draft',
      'draft_trip',
      'pending_expense',
      'expense_queue',
      'pending_mutation',
    ])
      db.exec(`CREATE TABLE ${table}(environment,account_id,trip_id)`);
    db.exec(`CREATE TABLE expense_rate_limit(environment,account_id,rate_limit_until);
      INSERT INTO pending_mutation VALUES ('e','a',NULL),('other','a',NULL),('e','b',NULL);`);
    const count = (scope) => Object.values(db.prepare(nativeDatabaseMatchSql(scope)).get())[0];
    assert.equal(count({ environment: 'e', accountId: 'a', tripId: 'unused' }), 1);
    assert.equal(count({ environment: 'missing', accountId: 'a', tripId: 'unused' }), 0);
    assert.equal(count({ environment: 'e', accountId: 'missing', tripId: 'unused' }), 0);
  } finally {
    db.close();
  }
});
