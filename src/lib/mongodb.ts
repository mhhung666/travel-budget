import mongoose from 'mongoose';
import { getEnv } from './env';

/**
 * Serverless 連線快取
 *
 * Vercel / Next.js 每次冷啟動或 HMR 都可能重新載入此模組，若每次都 connect
 * 會把 MongoDB 連線數打爆。將連線（與 in-flight 的 promise）掛在 globalThis
 * 上重用，確保整個程序只建立一條連線。
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & {
  _mongoose?: MongooseCache;
};

const cached: MongooseCache = globalForMongoose._mongoose ?? {
  conn: null,
  promise: null,
};
globalForMongoose._mongoose = cached;

/**
 * 取得一條已連線的 Mongoose 實例。
 * 所有 Server Action / API route 在存取資料庫前都應先 `await dbConnect()`。
 */
export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  const { MONGODB_URI } = getEnv();

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // 連線失敗時清掉 promise，下次呼叫才會重試
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}
