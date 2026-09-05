import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  auditAccounts,
  coreQueries,
  summarizeExplain,
  CANDIDATE_INDEXES,
} from '../../scripts/lib/mongo-explain.mjs';

describe('MongoDB baseline', () => {
  it('shows help without a database and refuses implicit app URI fallback', () => {
    const env = {
      ...process.env,
      MONGODB_BASELINE_URI: '',
      MONGODB_URI: 'mongodb://do-not-connect.invalid/private',
    };
    const help = spawnSync(process.execPath, ['scripts/explain-mongodb.mjs', '--help'], {
      env,
      encoding: 'utf8',
    });
    expect(help.status).toBe(0);
    const missing = spawnSync(process.execPath, ['scripts/explain-mongodb.mjs'], {
      env,
      encoding: 'utf8',
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('MONGODB_BASELINE_URI is required');
    expect(missing.stderr).not.toContain('do-not-connect.invalid');
  });
  it('ignores echoed sort and rejected/allPlansExecution scans', () => {
    const result = summarizeExplain({
      command: { pipeline: [{ $sort: { date: -1 } }] },
      queryPlanner: {
        winningPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'trip_1' } },
        rejectedPlans: [{ stage: 'SORT', inputStage: { stage: 'COLLSCAN' } }],
      },
      executionStats: {
        nReturned: 12,
        totalDocsExamined: 12,
        totalKeysExamined: 12,
        executionTimeMillis: 3,
        allPlansExecution: [{ stage: 'COLLSCAN' }],
      },
    });
    expect(result).toMatchObject({
      nReturned: 12,
      totalDocsExamined: 12,
      totalKeysExamined: 12,
      executionTimeMillis: 3,
      indexes: ['trip_1'],
      blockingSort: false,
      collectionScan: false,
    });
  });
  it('keeps aggregate output count distinct from cursor input count', () => {
    expect(
      summarizeExplain({
        stages: [
          {
            $cursor: {
              queryPlanner: { winningPlan: { stage: 'COLLSCAN' } },
              executionStats: {
                nReturned: 100,
                totalDocsExamined: 100,
                totalKeysExamined: 0,
                executionTimeMillis: 2,
              },
            },
          },
          { $group: { _id: '$trip' }, nReturned: 5 },
          { $sort: { sortKey: { count: -1 } }, nReturned: 5 },
        ],
      })
    ).toMatchObject({
      nReturned: 5,
      totalDocsExamined: 100,
      blockingSort: true,
      collectionScan: true,
    });
  });
  it('does not invent execution statistics for planner-only output', () => {
    expect(summarizeExplain({ queryPlanner: { winningPlan: { stage: 'IXSCAN' } } })).toMatchObject({
      nReturned: null,
      executionTimeMillis: null,
    });
  });
  it('reports sharded aggregation per shard without pretending first shard is total', () => {
    const result = summarizeExplain({
      shards: {
        a: {
          executionStats: {
            nReturned: 3,
            totalDocsExamined: 3,
            totalKeysExamined: 3,
            executionStages: { stage: 'IXSCAN', indexName: 'a_1' },
          },
        },
      },
    });
    expect(result.totalDocsExamined).toBeNull();
    expect(result.shards[0].totalDocsExamined).toBe(3);
    expect(result.indexes).toEqual(['a_1']);
  });
  it('matches current full-list sorts without introducing a fake page limit', () => {
    const queries = coreQueries({ trip: 'trip', since: new Date(0), username: 'alice' });
    expect(queries.find((q) => q.name === 'photos.list')).toMatchObject({
      sort: { takenAt: -1, createdAt: -1 },
    });
    expect(queries.find((q) => q.name === 'expenses.list')).toMatchObject({
      sort: { date: -1, createdAt: -1 },
    });
    expect(queries.filter((q) => q.limit)).toHaveLength(1);
    expect(queries.find((q) => q.name === 'users.username')).toMatchObject({
      limit: 1,
      collation: { locale: 'en', strength: 2 },
    });
    expect(CANDIDATE_INDEXES).toHaveLength(7);
  });
  it('audits with database collation and never returns account identifiers', async () => {
    const aggregate = vi
      .fn()
      .mockReturnValue({ toArray: async () => [{ groups: 2, documents: 4 }] });
    const countDocuments = vi.fn().mockResolvedValue(1);
    const result = await auditAccounts({ collection: () => ({ aggregate, countDocuments }) }, 5000);
    expect(result).toEqual({
      username: { groups: 2, documents: 4, invalid: 1 },
      email: { groups: 2, documents: 4, invalid: 1 },
    });
    expect(aggregate).toHaveBeenCalledWith(expect.any(Array), {
      collation: { locale: 'en', strength: 2 },
      maxTimeMS: 5000,
      allowDiskUse: false,
    });
  });
});
