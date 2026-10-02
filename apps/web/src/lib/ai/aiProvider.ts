import { NoObjectGeneratedError, RetryError } from 'ai';
import { z } from 'zod';

export type AiProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiProviderErrorCode =
  | 'FEATURE_DISABLED'
  | 'RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_MODEL_OUTPUT'
  | 'MODEL_OUTPUT_LIMIT'
  | 'INTERNAL_ERROR';

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    options?: { cause?: unknown }
  ) {
    super(code, options);
    this.name = 'AiProviderError';
  }
}

function numericProperty(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const property = Reflect.get(value, key);
  return typeof property === 'number' ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const property = Reflect.get(value, key);
  return typeof property === 'string' ? property : undefined;
}

/** Convert provider- and SDK-specific failures into a small response-safe taxonomy. */
export function classifyAiProviderFailure(
  error: unknown,
  visited: Set<unknown> = new Set()
): AiProviderErrorCode {
  if (visited.has(error)) return 'INTERNAL_ERROR';
  visited.add(error);

  if (error instanceof AiProviderError) return error.code;
  if (error instanceof z.ZodError) return 'INVALID_MODEL_OUTPUT';
  if (NoObjectGeneratedError.isInstance(error)) {
    const finishReason = stringProperty(error.cause, 'finishReason');
    return finishReason === 'length' ? 'MODEL_OUTPUT_LIMIT' : 'INVALID_MODEL_OUTPUT';
  }

  if (RetryError.isInstance(error)) {
    if (error.reason === 'abort') return 'PROVIDER_TIMEOUT';
    return classifyAiProviderFailure(error.lastError, visited);
  }

  const statusCode = numericProperty(error, 'statusCode') ?? numericProperty(error, 'status');
  const name = stringProperty(error, 'name') ?? '';
  if (statusCode === 401 || statusCode === 403) return 'FEATURE_DISABLED';
  if (statusCode === 429 || /RateLimit/i.test(name)) return 'RATE_LIMITED';
  if (/Abort|Timeout/i.test(name)) return 'PROVIDER_TIMEOUT';

  if (error && typeof error === 'object') {
    const cause = Reflect.get(error, 'cause');
    if (cause) return classifyAiProviderFailure(cause, visited);
  }
  return 'INTERNAL_ERROR';
}
