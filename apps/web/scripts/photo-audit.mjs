import { parseArgs } from 'node:util';
import { mkdir, open, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { S3Client } from '@aws-sdk/client-s3';
import { createAuditStorage, runPhotoAudit } from './lib/photo-audit.mjs';

const HELP = `Photo history audit (no object deletion or cleanup scheduling).

pnpm photos:audit --trip <ObjectId> --out <new-directory> [options]
pnpm photos:audit --all --out <new-directory> [options]

  --apply              Backfill verified stored JPEG hash metadata in photos
  --inventory-only     List/classify objects and check photo pairs; skip hashing
  --grace-hours 48     Exclude recent unreferenced objects from orphan candidates
                       and recent display objects from hashing (minimum 24)
  --page-size 200      R2 listing / MongoDB cursor batch size (1–1000)
  --delay-ms 100       Minimum delay between R2 requests (0–60000)
  --help              Show help without loading credentials or connecting

Explicit targets (no fallback to application MONGODB_URI or R2_*):
  PHOTO_AUDIT_MONGODB_URI, PHOTO_AUDIT_MONGODB_DB (optional override)
  PHOTO_AUDIT_R2_ACCOUNT_ID, PHOTO_AUDIT_R2_BUCKET
  PHOTO_AUDIT_R2_ACCESS_KEY_ID, PHOTO_AUDIT_R2_SECRET_ACCESS_KEY

Default is read-only. Reports: summary.json, report.md, objects.jsonl,
photos.jsonl, duplicates.jsonl. Re-run with a NEW output directory; --apply
reuses hashes only when HEAD identity still matches. Exit 2 means per-photo
errors; inspect summary.complete / hashCoverageComplete for partial coverage.
`;

function options() {
  const { values } = parseArgs({
    options: {
      trip: { type: 'string' },
      all: { type: 'boolean' },
      out: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'inventory-only': { type: 'boolean', default: false },
      'grace-hours': { type: 'string', default: '48' },
      'page-size': { type: 'string', default: '200' },
      'delay-ms': { type: 'string', default: '100' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return { help: true };
  if (Boolean(values.trip) === Boolean(values.all))
    throw new Error('Choose --trip <ObjectId> or --all.');
  if (values.trip && !/^[a-f\d]{24}$/i.test(values.trip))
    throw new Error('--trip must be an ObjectId.');
  if (!values.out) throw new Error('--out must name a new report directory.');
  if (values.apply && values['inventory-only'])
    throw new Error('--apply requires hashing; remove --inventory-only.');
  for (const [key, min, max] of [
    ['grace-hours', 24, 87600],
    ['page-size', 1, 1000],
    ['delay-ms', 0, 60000],
  ]) {
    if (
      !Number.isInteger(Number(values[key])) ||
      Number(values[key]) < min ||
      Number(values[key]) > max
    )
      throw new Error(`Invalid --${key}.`);
  }
  return {
    tripId: values.trip?.toLowerCase(),
    out: resolve(values.out),
    apply: values.apply,
    inventoryOnly: values['inventory-only'],
    graceHours: Number(values['grace-hours']),
    pageSize: Number(values['page-size']),
    delayMs: Number(values['delay-ms']),
  };
}

function markdown(summary) {
  return (
    `# 相簿歷史盤點報告\n\n` +
    `- 掃描完成：${summary.complete ? '是' : '否（中斷或失敗，結果不完整）'}\n` +
    `- Hash 完整涵蓋：${summary.hashCoverageComplete ? '是' : '否'}\n` +
    `- 範圍：${summary.scope}\n- 開始：${summary.startedAt}\n` +
    `- 模式：${summary.apply ? '回填 storedHash' : '只讀'}\n` +
    `- 物件：${summary.objects}；合計 bytes：${summary.bytes}\n` +
    `- 照片：${summary.photos}；有效 hash：${summary.hashes}；回填：${summary.backfilled}\n` +
    `- 缺少配對的照片：${summary.anomalies}；讀取／驗證錯誤：${summary.hashErrors}；略過：${summary.skipped}\n` +
    `- 同旅程重複群組：${summary.duplicateGroups}；群組內照片總數：${summary.duplicatePhotos}\n\n` +
    `| 物件分類 | 數量 | bytes |\n| --- | ---: | ---: |\n` +
    Object.entries(summary.categories)
      .map(([name, count]) => `| ${name} | ${count.count} | ${count.bytes} |`)
      .join('\n') +
    `\n\n逐物件依據見 objects.jsonl，照片缺檔／hash 結果見 photos.jsonl，重複照片 ID 與 key 見 duplicates.jsonl。\n\n` +
    `這是不同時間點的 R2／DB 觀察，疑似孤兒不是刪除清單。未刪除物件、未登記清理工作。\n\n` +
    `重複只代表同旅程已儲存 JPEG bytes 完全相同，不代表所有視覺相似照片；storedHash 與原始 File 的 sourceHash 不可互換。\n`
  );
}

let args;
try {
  args = options();
} catch {
  process.stderr.write('Invalid arguments. Use pnpm photos:audit --help.\n');
  process.exit(1);
}
if (args.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
const required = [
  'MONGODB_URI',
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
].map((name) => `PHOTO_AUDIT_${name}`);
if (required.some((name) => !process.env[name])) {
  process.stderr.write(
    `Explicit audit target required: ${required.join(', ')}. App credentials are not used.\n`
  );
  process.exit(1);
}
if (!/^[a-f\d]{32}$/i.test(process.env.PHOTO_AUDIT_R2_ACCOUNT_ID)) {
  process.stderr.write('Invalid PHOTO_AUDIT_R2_ACCOUNT_ID.\n');
  process.exit(1);
}

const abort = new AbortController();
const stop = () => abort.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const handles = {};
let latest;
let client;
let outputCreated = false;
async function emit(name, row) {
  if (name === 'summary') {
    latest = structuredClone(row);
    await writeFile(join(args.out, 'summary.json.tmp'), `${JSON.stringify(row, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(join(args.out, 'summary.json.tmp'), join(args.out, 'summary.json'));
    await writeFile(join(args.out, 'report.md'), markdown(row), { mode: 0o600 });
  } else await handles[name].write(`${JSON.stringify(row)}\n`);
}
try {
  // Refuse overwriting or mixing with a previous run, including symlinks.
  await mkdir(args.out, { mode: 0o700 });
  outputCreated = true;
  for (const name of ['objects', 'photos', 'duplicates'])
    handles[name] = await open(join(args.out, `${name}.jsonl`), 'wx', 0o600);
  await mongoose.connect(process.env.PHOTO_AUDIT_MONGODB_URI, {
    ...(process.env.PHOTO_AUDIT_MONGODB_DB ? { dbName: process.env.PHOTO_AUDIT_MONGODB_DB } : {}),
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.PHOTO_AUDIT_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    maxAttempts: 3,
    credentials: {
      accessKeyId: process.env.PHOTO_AUDIT_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.PHOTO_AUDIT_R2_SECRET_ACCESS_KEY,
    },
  });
  const storage = createAuditStorage(client, process.env.PHOTO_AUDIT_R2_BUCKET, {
    delayMs: args.delayMs,
    signal: abort.signal,
  });
  const summary = await runPhotoAudit({
    ...args,
    db: mongoose.connection.db,
    storage,
    emit,
    signal: abort.signal,
  });
  process.stdout.write(
    `Audit complete. Objects: ${summary.objects}; photos: ${summary.photos}; duplicate groups: ${summary.duplicateGroups}; errors: ${summary.hashErrors}. Reports: ${args.out}\n`
  );
  if (summary.hashErrors) process.exitCode = 2;
} catch {
  // Driver / SDK errors can include credentials and private identifiers; do not echo them.
  process.stderr.write(
    'Audit failed or interrupted. Check explicit targets, permissions and connectivity. Any output is partial; re-run into a new directory.\n'
  );
  process.exitCode = 1;
  if (outputCreated) {
    try {
      if (latest)
        await emit('summary', {
          ...latest,
          complete: false,
          hashCoverageComplete: false,
          interrupted: true,
        });
      else
        await writeFile(
          join(args.out, 'summary.json'),
          `${JSON.stringify({ format: 1, complete: false, error: 'startup_failed' })}\n`,
          { mode: 0o600 }
        );
    } catch {
      /* Original error is already reported; never overwrite another run. */
    }
  }
} finally {
  const closed = await Promise.allSettled(Object.values(handles).map((handle) => handle.close()));
  if (closed.some((r) => r.status === 'rejected')) {
    process.exitCode = 1;
    process.stderr.write('Report close failed; verify output files.\n');
  }
  client?.destroy();
  await mongoose.disconnect();
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
