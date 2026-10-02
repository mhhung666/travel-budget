import { track } from '@vercel/analytics';
import type { StatsInsightRuleVersion, StatsInsightType } from '@/types';
import type { ItineraryImportErrorCode } from '@/lib/ai/itineraryImportSchema';

export const AI_EXPENSE_DRAFT_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'TRIP_NOT_FOUND',
  'INVALID_REQUEST',
  'INVALID_IMAGE',
  'USAGE_LIMITED',
  'FEATURE_DISABLED',
  'RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'INVALID_MODEL_OUTPUT',
  'MODEL_OUTPUT_LIMIT',
  'INTERNAL_ERROR',
  'UNKNOWN',
] as const;

export type AiExpenseDraftErrorCode = (typeof AI_EXPENSE_DRAFT_ERROR_CODES)[number];

export interface ProductEventMap {
  stats_insight_result: {
    ruleVersion: StatsInsightRuleVersion;
    result: 'none' | 'one' | 'two' | 'three_plus';
  };
  stats_insight_impression: {
    ruleVersion: StatsInsightRuleVersion;
    insightType: StatsInsightType;
  };
  stats_insight_action: {
    ruleVersion: StatsInsightRuleVersion;
    insightType: StatsInsightType;
    action: 'view_details' | 'clear_filters';
  };
  activation_step: {
    step: 'registered' | 'trip_created' | 'expense_created' | 'companion_added' | 'invite_shared';
  };
  quick_add_flow: {
    stage: 'picker_shown' | 'trip_creation_shown' | 'form_opened' | 'expense_submitted';
    path: 'direct' | 'picker' | 'created';
  };
  expense_correction: {
    action: 'edited' | 'deleted';
    timing: 'within_2_minutes' | 'later' | 'unknown';
  };
  offline_expense: {
    state: 'queued' | 'synced' | 'failed';
  };
  ai_itinerary_import: {
    stage:
      | 'parse_started'
      | 'preview_shown'
      | 'parse_failed'
      | 'confirm_started'
      | 'confirmed'
      | 'confirm_failed'
      | 'cancelled';
    result: 'pending' | 'success' | 'partial' | 'failure' | 'cancelled';
    corrected: 'yes' | 'no' | 'unknown';
    errorCode: ItineraryImportErrorCode | 'CONFIRMATION_ERROR' | 'none';
  };
  ai_expense_draft: {
    source: 'text' | 'receipt';
    stage: 'parse_started' | 'preview_shown' | 'parse_failed' | 'applied';
    result: 'pending' | 'success' | 'needs_review' | 'failure';
    errorCode: AiExpenseDraftErrorCode | 'none';
  };
}

const aiExpenseDraftErrorCodes = new Set<string>(AI_EXPENSE_DRAFT_ERROR_CODES);

export function toAiExpenseDraftErrorCode(value: unknown): AiExpenseDraftErrorCode {
  return typeof value === 'string' && aiExpenseDraftErrorCodes.has(value)
    ? (value as AiExpenseDraftErrorCode)
    : 'UNKNOWN';
}

/**
 * Privacy-safe product measurement.
 *
 * Payloads intentionally accept only fixed categorical values. Never extend
 * this with identifiers, names, descriptions, invitation codes, dates, or
 * exact monetary values.
 */
export function trackProductEvent<Name extends keyof ProductEventMap>(
  name: Name,
  properties: ProductEventMap[Name]
) {
  try {
    track(name, properties);
  } catch {
    // Measurement is best-effort and must never interrupt the user's task.
  }
}

export function getCorrectionTiming(
  createdAt: string | null | undefined,
  now: Date = new Date()
): ProductEventMap['expense_correction']['timing'] {
  if (!createdAt) return 'unknown';
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return 'unknown';

  const elapsed = now.getTime() - created.getTime();
  if (elapsed < 0) return 'unknown';
  return elapsed <= 2 * 60_000 ? 'within_2_minutes' : 'later';
}
