// Backward-compatible names for the original itinerary-import quota module. All AI draft routes
// now share the same persistent global/user/trip buckets and cost cap.
export {
  AiUsageQuotaError as ItineraryImportQuotaError,
  estimateAiUsageCostMicroUsd as estimateItineraryImportCostMicroUsd,
  reserveAiUsageQuota as reserveItineraryImportQuota,
  resolveAiUsageQuotaConfig as resolveItineraryImportQuotaConfig,
  settleAiUsageQuota as settleItineraryImportQuota,
} from './aiUsageQuota';

export type {
  AiUsageQuotaConfig as ItineraryImportQuotaConfig,
  AiUsageQuotaReservation as ItineraryImportQuotaReservation,
} from './aiUsageQuota';
