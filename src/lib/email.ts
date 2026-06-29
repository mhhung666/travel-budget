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

/** Resend 單次 batch 上限（每呼叫最多 100 封）。 */
const BATCH_SIZE = 100;
/**
 * batch 呼叫間的最小間隔（ms）。Resend 限制 2 req/s，故 ≥500ms 即安全；取 600ms 留餘裕。
 * 只有收件者 > 100（需分塊）時才會用到。
 */
const BATCH_INTERVAL_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * 批次寄出多封 Email，回傳實際送出的封數。永不 throw（best-effort，比照 sendEmail）。
 *
 * 為什麼需要：fan-out（notify / cron 摘要）原本用 `Promise.all(map(sendEmail))` 併發
 * 寄信，瞬間 N 個請求會撞上 Resend 的 2 req/s 限制 → 多出的被 429 擋掉、信件靜默遺失。
 * 改用 Resend Batch API：一次 HTTP request 送最多 100 封（每封各自 to/subject/html，
 * 逐人在地化照舊），N 封信 → ceil(N/100) 個請求。> 100 才分塊並在塊間節流，避免再次撞限。
 */
export async function sendEmailBatch(messages: SendEmailInput[]): Promise<number> {
  if (messages.length === 0) return 0;
  const config = getResendConfig();
  if (!config) return 0; // 未配置 Resend → 靜默跳過

  const client = getClient(config.apiKey);
  let sent = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    if (i > 0) await sleep(BATCH_INTERVAL_MS); // 第二塊起節流，守住 2 req/s
    try {
      const { error } = await client.batch.send(
        chunk.map((m) => ({
          from: config.from,
          to: m.to,
          subject: m.content.subject,
          html: m.content.html,
          text: m.content.text,
        }))
      );
      if (error) {
        logger.error('sendEmailBatch chunk failed', error);
        continue; // 單一塊失敗不影響其餘塊
      }
      sent += chunk.length;
    } catch (error) {
      logger.error('sendEmailBatch threw', error);
    }
  }
  return sent;
}
