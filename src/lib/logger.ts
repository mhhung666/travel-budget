/**
 * 極簡結構化 logger。
 *
 * 全專案統一透過這裡輸出 log，而非裸 `console.*`：
 * - 統一格式、統一層級過濾，serverless 上較易查詢。
 * - 之後若要接 Sentry / Axiom / Datadog，只需改這一處。
 *
 * 行為依 `NODE_ENV` 調整：
 * - production：每筆輸出一行 JSON（`{ level, time, message, meta }`），方便日誌平台解析。
 * - 其他（development / test）：人類可讀的單行 `[level] message`，meta 原樣帶出。
 *
 * 可同時用於 server（actions / route handlers）與 client（components / hooks）——
 * 只依賴 `console` 與 `process.env.NODE_ENV`，不碰任何 node-only API。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const isProd = process.env.NODE_ENV === 'production';

// production 不輸出 debug；其餘環境全開。
const MIN_LEVEL: LogLevel = isProd ? 'info' : 'debug';

/** 將 Error 攤平成可序列化的物件（JSON.stringify 無法序列化 Error 的 message/stack）。 */
function normalize(meta: unknown): unknown {
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  return meta;
}

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (PRIORITY[level] < PRIORITY[MIN_LEVEL]) return;

  // debug 在 console 上對應 console.debug，其餘各自對應同名方法（warn/error → stderr）。
  // 這是全專案唯一直接呼叫 console 的地方（no-console 只放行 warn/error）。
  // eslint-disable-next-line no-console
  const sink = console[level];
  const normalized = meta === undefined ? undefined : normalize(meta);

  if (isProd) {
    const entry: Record<string, unknown> = { level, time: new Date().toISOString(), message };
    if (normalized !== undefined) entry.meta = normalized;
    sink(JSON.stringify(entry));
    return;
  }

  if (normalized !== undefined) {
    sink(`[${level}] ${message}`, normalized);
  } else {
    sink(`[${level}] ${message}`);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
