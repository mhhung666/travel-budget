import { z } from 'zod';
import { dbConnect } from '@/lib/mongodb';
import { AiImportUsage, type AiImportUsageDoc } from '@/models';
import type { ItineraryImportUsage } from './itineraryImportProvider';

const DEFAULT_USER_REQUESTS = 5;
const DEFAULT_TRIP_REQUESTS = 10;
const DEFAULT_GLOBAL_REQUESTS = 50;
const RETENTION_DAYS = 35;

const quotaConfigSchema = z.object({
  userRequests: z.number().int().positive().max(10_000),
  tripRequests: z.number().int().positive().max(10_000),
  globalRequests: z.number().int().positive().max(1_000_000),
  dailyCostLimitMicroUsd: z.number().int().nonnegative().max(1_000_000_000),
  requestCostReserveMicroUsd: z.number().int().nonnegative().max(1_000_000_000),
  inputMicroUsdPerMillionTokens: z.number().nonnegative().max(1_000_000_000),
  outputMicroUsdPerMillionTokens: z.number().nonnegative().max(1_000_000_000),
});

export type ItineraryImportQuotaConfig = z.infer<typeof quotaConfigSchema>;

type QuotaEnvironment = Record<string, string | undefined>;
type Scope = 'global' | 'user' | 'trip';
type ReservedScope = { scope: Scope; scopeKey: string };

export type ItineraryImportQuotaReservation = {
  periodStart: Date;
  reservedMicroUsd: number;
  scopes: ReservedScope[];
};

export class ItineraryImportQuotaError extends Error {
  constructor(public readonly code: 'USAGE_LIMITED' | 'INTERNAL_ERROR') {
    super(code);
    this.name = 'ItineraryImportQuotaError';
  }
}

function numericEnvironmentValue(
  environment: QuotaEnvironment,
  key: string,
  fallback: number
): number {
  const value = environment[key];
  if (value === undefined || value.trim() === '') return fallback;
  return Number(value);
}

export function resolveItineraryImportQuotaConfig(
  environment: QuotaEnvironment = process.env
): ItineraryImportQuotaConfig {
  const result = quotaConfigSchema.safeParse({
    userRequests: numericEnvironmentValue(
      environment,
      'AI_IMPORT_DAILY_USER_REQUESTS',
      DEFAULT_USER_REQUESTS
    ),
    tripRequests: numericEnvironmentValue(
      environment,
      'AI_IMPORT_DAILY_TRIP_REQUESTS',
      DEFAULT_TRIP_REQUESTS
    ),
    globalRequests: numericEnvironmentValue(
      environment,
      'AI_IMPORT_DAILY_GLOBAL_REQUESTS',
      DEFAULT_GLOBAL_REQUESTS
    ),
    dailyCostLimitMicroUsd: numericEnvironmentValue(
      environment,
      'AI_IMPORT_DAILY_COST_LIMIT_MICRO_USD',
      0
    ),
    requestCostReserveMicroUsd: numericEnvironmentValue(
      environment,
      'AI_IMPORT_REQUEST_COST_RESERVE_MICRO_USD',
      0
    ),
    inputMicroUsdPerMillionTokens: numericEnvironmentValue(
      environment,
      'AI_IMPORT_INPUT_MICRO_USD_PER_MILLION_TOKENS',
      0
    ),
    outputMicroUsdPerMillionTokens: numericEnvironmentValue(
      environment,
      'AI_IMPORT_OUTPUT_MICRO_USD_PER_MILLION_TOKENS',
      0
    ),
  });
  if (!result.success) throw new ItineraryImportQuotaError('INTERNAL_ERROR');
  if (result.data.dailyCostLimitMicroUsd > 0 && result.data.requestCostReserveMicroUsd === 0) {
    // A positive cap without a per-request reservation cannot protect against concurrent requests.
    throw new ItineraryImportQuotaError('INTERNAL_ERROR');
  }
  return result.data;
}

function utcDay(now: Date): { periodStart: Date; expiresAt: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expiresAt = new Date(periodStart);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RETENTION_DAYS);
  return { periodStart, expiresAt };
}

function isDuplicateKeyError(error: unknown): boolean {
  return !!error && typeof error === 'object' && Reflect.get(error, 'code') === 11000;
}

async function reserveScope(input: {
  scope: Scope;
  scopeKey: string;
  periodStart: Date;
  expiresAt: Date;
  requestLimit: number;
  costLimit: number;
  reserveCost: number;
}): Promise<boolean> {
  const constraints: Record<string, unknown>[] = [
    { $lt: [{ $ifNull: ['$requests', 0] }, input.requestLimit] },
  ];
  if (input.costLimit > 0) {
    constraints.push({
      $lte: [
        {
          $add: [
            { $ifNull: ['$spentMicroUsd', 0] },
            { $ifNull: ['$reservedMicroUsd', 0] },
            input.reserveCost,
          ],
        },
        input.costLimit,
      ],
    });
  }

  try {
    const result = await AiImportUsage.findOneAndUpdate(
      {
        scope: input.scope,
        scopeKey: input.scopeKey,
        periodStart: input.periodStart,
        $expr: { $and: constraints },
      },
      {
        $setOnInsert: { expiresAt: input.expiresAt },
        $inc: { requests: 1, reservedMicroUsd: input.reserveCost },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<AiImportUsageDoc | null>();
    return result !== null;
  } catch (error) {
    // When an existing bucket no longer matches a limit, upsert races the unique index. Treat that
    // duplicate as a clean limit rejection rather than exposing database details.
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

async function releaseScopes(reservation: ItineraryImportQuotaReservation): Promise<void> {
  await Promise.all(
    reservation.scopes.map(({ scope, scopeKey }) =>
      AiImportUsage.updateOne(
        { scope, scopeKey, periodStart: reservation.periodStart },
        { $inc: { requests: -1, reservedMicroUsd: -reservation.reservedMicroUsd } }
      )
    )
  );
}

export async function reserveItineraryImportQuota(input: {
  userId: string;
  tripId: string;
  now?: Date;
}): Promise<ItineraryImportQuotaReservation> {
  await dbConnect();
  const config = resolveItineraryImportQuotaConfig();
  const { periodStart, expiresAt } = utcDay(input.now ?? new Date());
  const scopes: Array<ReservedScope & { requestLimit: number; costLimit: number }> = [
    {
      scope: 'global',
      scopeKey: 'all',
      requestLimit: config.globalRequests,
      costLimit: config.dailyCostLimitMicroUsd,
    },
    {
      scope: 'user',
      scopeKey: input.userId,
      requestLimit: config.userRequests,
      costLimit: 0,
    },
    {
      scope: 'trip',
      scopeKey: input.tripId,
      requestLimit: config.tripRequests,
      costLimit: 0,
    },
  ];
  const reservation: ItineraryImportQuotaReservation = {
    periodStart,
    reservedMicroUsd: config.requestCostReserveMicroUsd,
    scopes: [],
  };

  try {
    for (const scope of scopes) {
      const reserved = await reserveScope({
        ...scope,
        periodStart,
        expiresAt,
        reserveCost: config.requestCostReserveMicroUsd,
      });
      if (!reserved) {
        const rollback = { ...reservation, scopes: reservation.scopes };
        reservation.scopes = [];
        await releaseScopes(rollback);
        throw new ItineraryImportQuotaError('USAGE_LIMITED');
      }
      reservation.scopes.push({ scope: scope.scope, scopeKey: scope.scopeKey });
    }
    return reservation;
  } catch (error) {
    if (error instanceof ItineraryImportQuotaError) throw error;
    const rollback = { ...reservation, scopes: reservation.scopes };
    reservation.scopes = [];
    await releaseScopes(rollback).catch(() => undefined);
    throw new ItineraryImportQuotaError('INTERNAL_ERROR');
  }
}

export function estimateItineraryImportCostMicroUsd(
  usage: ItineraryImportUsage,
  config: ItineraryImportQuotaConfig = resolveItineraryImportQuotaConfig()
): number {
  const inputCost = ((usage.inputTokens ?? 0) * config.inputMicroUsdPerMillionTokens) / 1_000_000;
  const outputCost =
    ((usage.outputTokens ?? 0) * config.outputMicroUsdPerMillionTokens) / 1_000_000;
  return Math.max(0, Math.ceil(inputCost + outputCost));
}

export async function settleItineraryImportQuota(
  reservation: ItineraryImportQuotaReservation,
  result: { success: boolean; usage?: ItineraryImportUsage }
): Promise<{ costMicroUsd: number }> {
  const usage = result.usage ?? {};
  // Provider failures often omit usage even after generating tokens. Charge the pre-reserved
  // worst-case amount in that case so repeated invalid/timeout responses cannot bypass the cap.
  const costMicroUsd = result.success
    ? estimateItineraryImportCostMicroUsd(usage)
    : reservation.reservedMicroUsd;
  await Promise.all(
    reservation.scopes.map(({ scope, scopeKey }) =>
      AiImportUsage.updateOne(
        { scope, scopeKey, periodStart: reservation.periodStart },
        {
          $inc: {
            reservedMicroUsd: -reservation.reservedMicroUsd,
            spentMicroUsd: costMicroUsd,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            successfulRequests: result.success ? 1 : 0,
            failedRequests: result.success ? 0 : 1,
          },
        }
      )
    )
  );
  return { costMicroUsd };
}
