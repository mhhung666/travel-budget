/** Prepare a user-selected managed Git worktree for precise native transaction termination. */
import assert from 'node:assert/strict';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
assert(values.workspace, 'Use --workspace <isolated managed Git worktree>');
const scripts = dirname(fileURLToPath(import.meta.url));
const source = await realpath(join(scripts, '../../..'));
const workspace = await realpath(values.workspace);
assert.notEqual(workspace, source, 'The active checkout cannot contain native SQL pauses');
assert(
  (await stat(join(workspace, '.git'))).isFile(),
  'Use a linked Git worktree, never the primary repository'
);
const storage = join(workspace, 'apps/mobile/src/storage');
const file = join(storage, 'pendingExpenseDatabase.ts');
const original = await readFile(file, 'utf8');
assert(!original.includes('wrapNativeAcceptance'), 'This worktree is already instrumented');
const needle = 'SQLite.openDatabaseAsync(DATABASE).catch';
assert(original.includes(needle), 'SQLite open changed; review the instrumentation before use');
const wrapper = await readFile(join(scripts, 'fixtures/nativeAcceptanceGate.ts.txt'), 'utf8');
const credentials = join(storage, 'credentials.ts');
const credentialSource = await readFile(credentials, 'utf8');
const credentialNeedle =
  'await SecureStore.setItemAsync(await key(), encodeCredential(token, user), options)';
assert(
  credentialSource.includes(credentialNeedle),
  'Credential write changed; review the isolated adapter'
);
const credentialWrapper = await readFile(
  join(scripts, 'fixtures/nativeCredentialGate.ts.txt'),
  'utf8'
);
const raceWrapper = await readFile(join(scripts, 'fixtures/nativeRequestGate.ts.txt'), 'utf8');
const clientFile = join(workspace, 'apps/mobile/src/api/client.ts');
const clientSource = await readFile(clientFile, 'utf8');
const entryFile = join(workspace, 'apps/mobile/src/features/expenses/entry.ts');
const entrySource = await readFile(entryFile, 'utf8');
const queueFile = join(workspace, 'apps/mobile/src/features/expenseQueue/sync.ts');
const queueSource = await readFile(queueFile, 'utf8');
const retryNeedle = `    return this.serial(scope, clientRequestId, async () => {
      const loaded = await this.load(scope, clientRequestId);
      return 'store' in loaded ? this.post(loaded.store, loaded.record, beforeSend) : loaded;
    });`;
const prepareNeedle = `          if (!(await store.prepare(r, payload))) {
            await store.pause(r, 'pending', this.now() + 30_000);
            blockedTrips.add(r.tripId);
            continue;
          }`;
const responseNeedle = '      checkAborted(options.signal);\n      if (timedOut)';
assert(
  clientSource.includes('      options.beforeSend?.();') && clientSource.includes(responseNeedle),
  'HTTP boundary changed'
);
assert(
  entrySource.includes(retryNeedle) && queueSource.includes(prepareNeedle),
  'C/queue boundary changed'
);
await writeFile(join(storage, 'nativeAcceptanceGate.ts'), wrapper);
await writeFile(
  file,
  "import { wrapNativeAcceptance } from './nativeAcceptanceGate';\n" +
    original.replace(needle, 'SQLite.openDatabaseAsync(DATABASE).then(wrapNativeAcceptance).catch')
);
await writeFile(join(storage, 'nativeCredentialGate.ts'), credentialWrapper);
await writeFile(
  credentials,
  "import { nativeCredentialValue } from './nativeCredentialGate';\n" +
    credentialSource
      .replace('{ decodeCredential, encodeCredential }', '{ decodeCredential }')
      .replace(
        credentialNeedle,
        'await SecureStore.setItemAsync(await key(), await nativeCredentialValue(environment, token, user), options)'
      )
);
await writeFile(join(storage, 'nativeRequestGate.ts'), raceWrapper);
await writeFile(
  clientFile,
  "import { nativeRequestPause } from '@/storage/nativeRequestGate';\n" +
    clientSource
      .replace(
        '      options.beforeSend?.();',
        '      await nativeRequestPause(this.baseUrl, path);\n      options.beforeSend?.();'
      )
      .replace(
        responseNeedle,
        '      if (response.ok) await nativeRequestPause(this.baseUrl, path, true);\n      checkAborted(options.signal);\n      if (timedOut)'
      )
);
await writeFile(
  entryFile,
  "import { nativeRaceEvent } from '@/storage/nativeRequestGate';\n" +
    entrySource.replace(
      retryNeedle,
      retryNeedle.replace('return this.serial', 'const run = this.serial') +
        "\n    void nativeRaceEvent('c-retry-enqueued', clientRequestId);\n    return run;"
    )
);
await writeFile(
  queueFile,
  "import { nativeSerialProbe } from '@/storage/nativeRequestGate';\n" +
    queueSource.replace(
      prepareNeedle,
      prepareNeedle +
        '\n          await nativeSerialProbe(this.deps.entry, scope, r.tripId, r.clientRequestId);'
    )
);
console.log(
  `Native acceptance adapters installed only in ${workspace}. Start Metro there with the documented fixture scope and gate URL.`
);
