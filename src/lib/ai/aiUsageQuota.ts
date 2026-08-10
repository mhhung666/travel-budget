import { z } from 'zod';
import { dbConnect } from '@/lib/mongodb';
import { AiImportUsage, type AiImportUsageDoc } from '@/models';
import type { AiProviderUsage } from './aiProvider';

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

export type AiUsageQuotaConfig = z.infer<typeof quotaConfigSchema>;

type QuotaEnvironment = Record<string, string | undefined>;
type Scope = 'global' | 'user' | 'trip';
type ReservedScope = { scope: Scope; scopeKey: string };

export type AiUsageQuotaReservation = {
  periodStart: Date;
  reservedMicroUsd: number;
  scopes: ReservedScope[];
};

export type AiUsageQuotaSummary = {
  usedRequests: number;
  requestLimit: number;
  remainingRequests: number;
  periodStart: Date;
  resetsAt: Date;
};

export class AiUsageQuotaError extends Error {
  constructor(public readonly code: 'USAGE_LIMITED' | 'INTERNAL_ERROR') {
    super(code);
    this.name = 'AiUsageQuotaError';
  }
}

function numericEnvironmentValue(
  environment: QuotaEnvironment,
  keys: string[],
  fallback: number
): number {
  const value = keys.map((key) => environment[key]).find((candidate) => candidate?.trim());
  return value === undefined ? fallback : Number(value);
}

/** Resolve shared AI limits, while accepting the original itinerary-only variable names. */
export function resolveAiUsageQuotaConfig(
  environment: QuotaEnvironment = process.env
): AiUsageQuotaConfig {
  const result = quotaConfigSchema.safeParse({
    userRequests: numericEnvironmentValue(
      environment,
      ['AI_DAILY_USER_REQUESTS', 'AI_IMPORT_DAILY_USER_REQUESTS'],
      DEFAULT_USER_REQUESTS
    ),
    tripRequests: numericEnvironmentValue(
      environment,
      ['AI_DAILY_TRIP_REQUESTS', 'AI_IMPORT_DAILY_TRIP_REQUESTS'],
      DEFAULT_TRIP_REQUESTS
    ),
    globalRequests: numericEnvironmentValue(
      environment,
      ['AI_DAILY_GLOBAL_REQUESTS', 'AI_IMPORT_DAILY_GLOBAL_REQUESTS'],
      DEFAULT_GLOBAL_REQUESTS
    ),
    dailyCostLimitMicroUsd: numericEnvironmentValue(
      environment,
      ['AI_DAILY_COST_LIMIT_MICRO_USD', 'AI_IMPORT_DAILY_COST_LIMIT_MICRO_USD'],
      0
    ),
    requestCostReserveMicroUsd: numericEnvironmentValue(
      environment,
      ['AI_REQUEST_COST_RESERVE_MICRO_USD', 'AI_IMPORT_REQUEST_COST_RESERVE_MICRO_USD'],
      0
    ),
    inputMicroUsdPerMillionTokens: numericEnvironmentValue(
      environment,
      ['AI_INPUT_MICRO_USD_PER_MILLION_TOKENS', 'AI_IMPORT_INPUT_MICRO_USD_PER_MILLION_TOKENS'],
      0
    ),
    outputMicroUsdPerMillionTokens: numericEnvironmentValue(
      environment,
      ['AI_OUTPUT_MICRO_USD_PER_MILLION_TOKENS', 'AI_IMPORT_OUTPUT_MICRO_USD_PER_MILLION_TOKENS'],
      0
    ),
  });
  if (!result.success) throw new AiUsageQuotaError('INTERNAL_ERROR');
  if (result.data.dailyCostLimitMicroUsd > 0 && result.data.requestCostReserveMicroUsd === 0) {
    throw new AiUsageQuotaError('INTERNAL_ERROR');
  }
  return result.data;
}

function utcDay(now: Date): { periodStart: Date; expiresAt: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expiresAt = new Date(periodStart);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RETENTION_DAYS);
  return { periodStart, expiresAt };
}

/** Read the authenticated user's shared AI allowance without reserving a request. */
export async function getAiUsageQuotaSummary(input: {
  userId: string;
  now?: Date;
}): Promise<AiUsageQuotaSummary> {
  const config = resolveAiUsageQuotaConfig();
  const { periodStart } = utcDay(input.now ?? new Date());
  const resetsAt = new Date(periodStart);
  resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);

  await dbConnect();
  const bucket = await AiImportUsage.findOne({
    scope: 'user',
    scopeKey: input.userId,
    periodStart,
  })
    .select('requests')
    .lean<Pick<AiImportUsageDoc, 'requests'> | null>();
  const usedRequests = Math.max(0, bucket?.requests ?? 0);

  return {
    usedRequests,
    requestLimit: config.userRequests,
    remainingRequests: Math.max(0, config.userRequests - usedRequests),
    periodStart,
    resetsAt,
  };
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

  const updateExistingBucket = async () =>
    AiImportUsage.findOneAndUpdate(
      {
        scope: input.scope,
        scopeKey: input.scopeKey,
        periodStart: input.periodStart,
        $expr: { $and: constraints },
      },
      { $inc: { requests: 1, reservedMicroUsd: input.reserveCost } },
      { returnDocument: 'after' }
    ).lean<AiImportUsageDoc | null>();

  const existingBucket = await updateExistingBucket();
  if (existingBucket) return true;
  if (input.costLimit > 0 && input.reserveCost > input.costLimit) return false;

  try {
    await AiImportUsage.create({
      scope: input.scope,
      scopeKey: input.scopeKey,
      periodStart: input.periodStart,
      expiresAt: input.expiresAt,
      requests: 1,
      reservedMicroUsd: input.reserveCost,
    });
    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return (await updateExistingBucket()) !== null;
  }
}

async function releaseScopes(reservation: AiUsageQuotaReservation): Promise<void> {
  await Promise.all(
    reservation.scopes.map(({ scope, scopeKey }) =>
      AiImportUsage.updateOne(
        { scope, scopeKey, periodStart: reservation.periodStart },
        { $inc: { requests: -1, reservedMicroUsd: -reservation.reservedMicroUsd } }
      )
    )
  );
}

export async function reserveAiUsageQuota(input: {
  userId: string;
  tripId: string;
  now?: Date;
}): Promise<AiUsageQuotaReservation> {
  await dbConnect();
  await AiImportUsage.init();
  const config = resolveAiUsageQuotaConfig();
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
  const reservation: AiUsageQuotaReservation = {
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
        throw new AiUsageQuotaError('USAGE_LIMITED');
      }
      reservation.scopes.push({ scope: scope.scope, scopeKey: scope.scopeKey });
    }
    return reservation;
  } catch (error) {
    if (error instanceof AiUsageQuotaError) throw error;
    const rollback = { ...reservation, scopes: reservation.scopes };
    reservation.scopes = [];
    await releaseScopes(rollback).catch(() => undefined);
    throw new AiUsageQuotaError('INTERNAL_ERROR');
  }
}

export function estimateAiUsageCostMicroUsd(
  usage: AiProviderUsage,
  config: AiUsageQuotaConfig = resolveAiUsageQuotaConfig()
): number {
  const inputCost = ((usage.inputTokens ?? 0) * config.inputMicroUsdPerMillionTokens) / 1_000_000;
  const outputCost =
    ((usage.outputTokens ?? 0) * config.outputMicroUsdPerMillionTokens) / 1_000_000;
  return Math.max(0, Math.ceil(inputCost + outputCost));
}

export async function settleAiUsageQuota(
  reservation: AiUsageQuotaReservation,
  result: { success: boolean; usage?: AiProviderUsage }
): Promise<{ costMicroUsd: number }> {
  const usage = result.usage ?? {};
  const costMicroUsd = result.success
    ? estimateAiUsageCostMicroUsd(usage)
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
