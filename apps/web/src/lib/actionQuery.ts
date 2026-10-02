import type { ActionResult, ErrorCode } from '@/actions/types';

/** Preserve action failures for Query's retry/error state, including their code. */
export class ActionQueryError extends Error {
  readonly code?: ErrorCode;

  constructor(error: string, code?: ErrorCode) {
    super(error);
    this.name = 'ActionQueryError';
    this.code = code;
  }
}

export function unwrapActionResult<T>(result: ActionResult<T>): T {
  if (!result.success) throw new ActionQueryError(result.error, result.code);
  return result.data;
}
