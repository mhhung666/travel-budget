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
