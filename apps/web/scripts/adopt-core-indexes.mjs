import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { adoptCoreIndexes } from './lib/adopt-core-indexes.mjs';

// Explicit .env source; reject shell overrides instead of silently choosing a different DB.
const env = dotenv.parse(fs.readFileSync('.env'));
const apply = process.argv.includes('--apply');
if (
  !env.MONGODB_URI ||
  ['MONGODB_URI', 'MONGODB_DB'].some((key) => process.env[key] && process.env[key] !== env[key])
) {
  throw new Error('Missing .env URI or conflicting database environment');
}
if (apply && !process.argv.includes('--confirm-no-other-ddl')) {
  throw new Error(
    'Apply requires --confirm-no-other-ddl; do not run other migration/index runners'
  );
}
const client = new mongoose.mongo.MongoClient(env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  writeConcern: { w: 'majority' },
});
try {
  await client.connect();
  const db = client.db(env.MONGODB_DB || undefined);
  console.log(
    JSON.stringify(
      { database: db.databaseName, ...(await adoptCoreIndexes(db, { apply })) },
      null,
      2
    )
  );
} catch (error) {
  console.error(JSON.stringify({ failed: true, type: error.name, code: error.code ?? null }));
  process.exitCode = 1;
} finally {
  await client.close();
}
