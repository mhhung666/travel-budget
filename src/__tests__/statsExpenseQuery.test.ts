import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { buildStatsExpensePagePipeline } from '@/lib/statsExpenseQuery';

const userId = new Types.ObjectId('64b000000000000000000001');
const expenseId = '64b000000000000000000002';
const match = {
  trip: { $in: [new Types.ObjectId('64b000000000000000000003')] },
  'splits.user': userId,
};

describe('buildStatsExpensePagePipeline', () => {
  it('sorts and limits date pages before unwinding splits', () => {
    const pipeline = buildStatsExpensePagePipeline({
      match,
      userId,
      sort: 'dateDesc',
      cursor: {
        sort: 'dateDesc',
        value: '2026-07-30T12:00:00.000Z',
        id: expenseId,
      },
      pageSize: 20,
    });

    expect(pipeline.map((stage) => Object.keys(stage)[0])).toEqual([
      '$match',
      '$sort',
      '$limit',
      '$unwind',
      '$match',
    ]);
    expect(pipeline[0]).toMatchObject({
      $match: {
        $and: [
          match,
          {
            $or: [
              { date: { $lt: new Date('2026-07-30T12:00:00.000Z') } },
              {
                date: new Date('2026-07-30T12:00:00.000Z'),
                _id: { $lt: new Types.ObjectId(expenseId) },
              },
            ],
          },
        ],
      },
    });
    expect(pipeline[1]).toEqual({ $sort: { date: -1, _id: -1 } });
    expect(pipeline[2]).toEqual({ $limit: 21 });
  });

  it('unwinds the authenticated split before sorting amount pages', () => {
    const pipeline = buildStatsExpensePagePipeline({
      match,
      userId,
      sort: 'amountAsc',
      cursor: {
        sort: 'amountAsc',
        value: 1200,
        id: expenseId,
      },
      pageSize: 20,
    });

    expect(pipeline.map((stage) => Object.keys(stage)[0])).toEqual([
      '$match',
      '$unwind',
      '$match',
      '$match',
      '$sort',
      '$limit',
    ]);
    expect(pipeline[3]).toMatchObject({
      $match: {
        $or: [
          { 'splits.shareAmount': { $gt: 1200 } },
          {
            'splits.shareAmount': 1200,
            _id: { $gt: new Types.ObjectId(expenseId) },
          },
        ],
      },
    });
    expect(pipeline[4]).toEqual({
      $sort: { 'splits.shareAmount': 1, _id: 1 },
    });
    expect(pipeline[5]).toEqual({ $limit: 21 });
  });
});
