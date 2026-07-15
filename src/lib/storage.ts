import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Config } from './env';

/**
 * Cloudflare R2（S3 相容）client 包裝。**server-only**：只被 server actions /
 * API routes 引用，切勿從 client component import（會把憑證/SDK 帶進前端 bundle）。
 *
 * 兩個 bucket：
 *   - `receipts`：私有。上傳走 presignPut、檢視走短效 presignGet（由 action 驗成員後簽發）。
 *   - `avatars` ：公開讀。上傳走 presignPut；對外以 avatarPublicUrl(key) 的穩定 URL 直接顯示。
 */

export type R2Bucket = 'receipts' | 'avatars';

const PUT_TTL_SECONDS = 120; // 簽名上傳的有效時間（足夠在慢速網路下完成）
const GET_TTL_SECONDS = 300; // 簽名檢視的有效時間（收據圖）

let client: S3Client | null = null;

function r2(): S3Client {
  if (client) return client;
  const cfg = getR2Config();
  client = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return client;
}

function bucketName(bucket: R2Bucket): string {
  const cfg = getR2Config();
  return bucket === 'receipts' ? cfg.receiptsBucket : cfg.avatarsBucket;
}

/** 簽發上傳用 URL。client 須以**相同的 contentType** 送 PUT，否則簽章不符。 */
export async function presignPut(
  bucket: R2Bucket,
  key: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucketName(bucket), Key: key, ContentType: contentType }),
    { expiresIn: PUT_TTL_SECONDS }
  );
}

/** 簽發短效檢視 URL（私有 bucket 的收據）。呼叫端須先驗成員身分。 */
export async function presignGet(bucket: R2Bucket, key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }), {
    expiresIn: GET_TTL_SECONDS,
  });
}

/** presignGetStable 的預設窗口：1 小時。 */
export const STABLE_GET_WINDOW_SECONDS = 60 * 60;

/**
 * 計算對齊到整點窗口的簽名參數（純函式，可單元測試）。
 *
 * `expiresIn` 是窗口的**兩倍**，這不是隨手取的：簽名時間戳被往回對齊到窗口起點，
 * 若 TTL 只有一個窗口長，那麼在窗口尾聲（例如 59:59）拿到的 URL 一秒後就死了。
 * 兩倍窗口保證從窗口內任一時刻拿到的 URL 都至少還有一整個窗口的壽命。
 */
export function stableSigningWindow(
  nowMs: number,
  windowSeconds: number
): { signingDate: Date; expiresIn: number } {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  return { signingDate: new Date(windowStart), expiresIn: windowSeconds * 2 };
}

/**
 * 簽發**窗口內逐字元穩定**的檢視 URL（相簿相片用）。呼叫端須先驗成員身分。
 *
 * 為什麼要有這顆：[sw.ts](../sw.ts) 對 R2 圖片是 CacheFirst、快取 key＝完整 URL。
 * `presignGet` 每次呼叫都產生不同的 `X-Amz-Date`／`X-Amz-Signature`，同一張相片每次
 * 瀏覽都是新 URL → 快取永遠 miss、而且無限膨脹。收據一次看一兩張無所謂，相簿一頁
 * 幾十張就會很明顯，離線也會看不到剛看過的相簿。
 *
 * 把簽名時間戳對齊到整點窗口後，同一窗口內對同一 key 產生完全相同的 URL，SW 才快取得到。
 *
 * **收據沿用 presignGet（300s、不對齊），不要改成這顆**——那是刻意的短效。
 */
export async function presignGetStable(
  bucket: R2Bucket,
  key: string,
  windowSeconds: number = STABLE_GET_WINDOW_SECONDS
): Promise<string> {
  const { signingDate, expiresIn } = stableSigningWindow(Date.now(), windowSeconds);
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }), {
    expiresIn,
    signingDate,
  });
}

/**
 * 讀取物件中繼資料以驗證實際上傳結果。presigned PUT 無法限制 client 真正送出的
 * 大小/型別，故存參照前以此核對（防 client 謊報）。物件不存在回 null。
 */
export async function headObject(
  bucket: R2Bucket,
  key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? '' };
  } catch {
    return null;
  }
}

/** DeleteObjects 的單次上限（S3/R2 協定規定）。超過就必須分批送。 */
const DELETE_BATCH_MAX = 1000;

/** 刪除指定 keys（自動分批，呼叫端不必自己算 1000 的上限）。 */
export async function deleteObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_BATCH_MAX) {
    await r2().send(
      new DeleteObjectsCommand({
        Bucket: bucketName(bucket),
        Delete: { Objects: keys.slice(i, i + DELETE_BATCH_MAX).map((Key) => ({ Key })) },
      })
    );
  }
}

/** Best-effort 刪除某 prefix 下所有物件（cascade 清理，例如刪旅程時清掉其收據）。 */
export async function deleteByPrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const listed = await r2().send(
      new ListObjectsV2Command({
        Bucket: bucketName(bucket),
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    await deleteObjects(bucket, keys);
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

/** 頭像物件的公開 URL（avatars bucket 為公開讀）。 */
export function avatarPublicUrl(key: string): string {
  return `${getR2Config().avatarsPublicUrl}/${key}`;
}

/** 反推頭像物件 key（替換/移除頭像時刪舊物件用）。非本 bucket 公開網址回 null。 */
export function avatarKeyFromUrl(url: string): string | null {
  const base = `${getR2Config().avatarsPublicUrl}/`;
  return url.startsWith(base) ? url.slice(base.length) : null;
}
