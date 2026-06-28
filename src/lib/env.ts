import { z } from 'zod';

/**
 * 集中式環境變數驗證
 *
 * 在啟動/首次存取時驗證必要的環境變數，缺漏或不合法即拋出清楚的錯誤，
 * 避免以不安全的預設值（如硬編碼 JWT 密鑰）運行。
 *
 * 注意：這些都是 server-only 變數（無 NEXT_PUBLIC_ 前綴），不會打包進前端。
 */
const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (no insecure fallback allowed)'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Cloudflare R2（blob 儲存）。一律 optional，讓未設定 R2 的環境（含 CI 的
  // dummy build）仍能正常 boot；只有實際用到上傳功能時才透過 getR2Config()
  // 嚴格檢查是否齊全。詳見 lib/storage.ts。
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_RECEIPTS_BUCKET: z.string().optional(),
  R2_AVATARS_BUCKET: z.string().optional(),
  R2_AVATARS_PUBLIC_URL: z.string().optional(),
  // Resend（Email 通知）。比照 R2 一律 optional：未設定 Email 的環境（含 CI build、
  // 本機未配置）仍能正常 boot；只有實際要寄信時才透過 getResendConfig() 嚴格檢查。
  // 詳見 lib/email.ts。
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  // Email 內連結用的對外站台基底 URL（如 https://travel.example.com），結尾斜線會去除。
  APP_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * 取得已驗證的環境變數。第一次呼叫時驗證並快取結果。
 * 驗證失敗會拋出列出所有問題的錯誤。
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * 已驗證的 Cloudflare R2 設定。所有欄位皆必填（與 envSchema 的 optional 相反）：
 * 在 envSchema 設 optional 是為了讓未啟用 blob 功能的環境正常啟動，但一旦呼叫
 * 此函式（代表正要用上傳功能），就要求設定齊全，否則丟出指出缺漏項目的明確錯誤。
 */
export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  receiptsBucket: string;
  avatarsBucket: string;
  /** 公開頭像 bucket 的對外基底 URL（r2.dev 或自訂網域），結尾斜線已去除。 */
  avatarsPublicUrl: string;
  /** S3 相容端點：https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string;
};

let cachedR2: R2Config | null = null;

export function getR2Config(): R2Config {
  if (cachedR2) return cachedR2;

  const env = getEnv();
  const required = {
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_RECEIPTS_BUCKET: env.R2_RECEIPTS_BUCKET,
    R2_AVATARS_BUCKET: env.R2_AVATARS_BUCKET,
    R2_AVATARS_PUBLIC_URL: env.R2_AVATARS_PUBLIC_URL,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`R2 storage is not configured. Missing: ${missing.join(', ')}`);
  }

  cachedR2 = {
    accountId: required.R2_ACCOUNT_ID!,
    accessKeyId: required.R2_ACCESS_KEY_ID!,
    secretAccessKey: required.R2_SECRET_ACCESS_KEY!,
    receiptsBucket: required.R2_RECEIPTS_BUCKET!,
    avatarsBucket: required.R2_AVATARS_BUCKET!,
    avatarsPublicUrl: required.R2_AVATARS_PUBLIC_URL!.replace(/\/+$/, ''),
    endpoint: `https://${required.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
  };
  return cachedR2;
}

/**
 * 已驗證的 Resend（Email）設定。比照 {@link getR2Config}：envSchema 設 optional
 * 讓未啟用 Email 的環境正常啟動，但一旦呼叫此函式（代表正要寄信），就要求 API key
 * 與寄件者齊全，否則丟出指出缺漏項目的明確錯誤。`appUrl` 為 optional（Email 內連結
 * 用；缺值時模板退回相對路徑），故不納入必填檢查。
 */
export type ResendConfig = {
  apiKey: string;
  from: string;
  /** Email 內連結的對外基底 URL，結尾斜線已去除；未設定時為 null。 */
  appUrl: string | null;
};

let cachedResend: ResendConfig | null = null;

/**
 * 取得已驗證的 Resend 設定。未設定（無 API key / 寄件者）時回傳 null —— 呼叫端
 * （lib/email.ts）據此**靜默跳過**寄信，使 Email 成為純加值、不阻斷主流程。
 */
export function getResendConfig(): ResendConfig | null {
  if (cachedResend) return cachedResend;

  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return null;

  cachedResend = {
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
    appUrl: env.APP_URL ? env.APP_URL.replace(/\/+$/, '') : null,
  };
  return cachedResend;
}
