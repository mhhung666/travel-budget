import { Resend } from 'resend';
import { getResendConfig } from './env';
import { logger } from './logger';
import type { EmailContent } from './emailTemplates';

/**
 * Email 寄送封裝。**server-only**：持有 Resend API key，只可被 server actions /
 * server-only 模組（lib/notify.ts）匯入。
 *
 * 設計重點（比照 lib/notify.ts / R2 清理）：
 * - **best-effort，永不 throw**：Email 是次要副作用，任何失敗只記 log，絕不阻斷主
 *   action（新增支出不能因為寄信失敗而失敗）。
 * - **env-gated**：未設定 Resend（getResendConfig() 回 null）時靜默跳過，使 Email
 *   成為純加值——未配置的環境（本機、CI）照常運作。
 */

let cachedClient: Resend | null = null;

function getClient(apiKey: string): Resend {
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

interface SendEmailInput {
  to: string;
  content: EmailContent;
}

/**
 * 寄出一封 Email。回傳是否實際送出（false＝未配置或失敗，已記 log）。永不 throw。
 */
export async function sendEmail({ to, content }: SendEmailInput): Promise<boolean> {
  try {
    const config = getResendConfig();
    if (!config) return false; // 未配置 Resend → 靜默跳過

    const client = getClient(config.apiKey);
    const { error } = await client.emails.send({
      from: config.from,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (error) {
      logger.error('sendEmail failed', error);
      return false;
    }
    return true;
  } catch (error) {
    logger.error('sendEmail threw', error);
    return false;
  }
}
