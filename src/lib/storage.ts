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

/** 刪除指定 keys（最多 1000/次，符合一般用量）。 */
export async function deleteObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await r2().send(
    new DeleteObjectsCommand({
      Bucket: bucketName(bucket),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
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
