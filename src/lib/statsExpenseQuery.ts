import { Types, type PipelineStage } from 'mongoose';
import type { StatsExpenseSort } from '@/types';
import type { StatsExpenseCursor } from '@/lib/statsExpenseCursor';

interface BuildStatsExpensePagePipelineOptions {
  match: Record<string, unknown>;
  userId: Types.ObjectId;
  sort: StatsExpenseSort;
  cursor: StatsExpenseCursor | null;
  pageSize: number;
}

/**
 * Build the index-sensitive portion of the expense detail query.
 *
 * Date sorting can use the splits.user/date/_id index before the split array is
 * expanded. Amount sorting must happen after unwind because shareAmount belongs
 * to the authenticated user's split.
 */
export function buildStatsExpensePagePipeline({
  match,
  userId,
  sort,
  cursor,
  pageSize,
}: BuildStatsExpensePagePipelineOptions): PipelineStage[] {
  const amountSort = sort === 'amountAsc' || sort === 'amountDesc';
  const direction: 1 | -1 = sort === 'dateAsc' || sort === 'amountAsc' ? 1 : -1;
  const sortField = amountSort ? 'splits.shareAmount' : 'date';
  const cursorMatch = cursor
    ? {
        $or: [
          {
            [sortField]: {
              [direction === 1 ? '$gt' : '$lt']: amountSort
                ? cursor.value
                : new Date(cursor.value as string),
            },
          },
          {
            [sortField]: amountSort ? cursor.value : new Date(cursor.value as string),
            _id: {
              [direction === 1 ? '$gt' : '$lt']: new Types.ObjectId(cursor.id),
            },
          },
        ],
      }
    : null;

  if (!amountSort) {
    return [
      { $match: cursorMatch ? { $and: [match, cursorMatch] } : match },
      { $sort: { date: direction, _id: direction } },
      { $limit: pageSize + 1 },
      { $unwind: '$splits' },
      { $match: { 'splits.user': userId } },
    ];
  }

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $unwind: '$splits' },
    { $match: { 'splits.user': userId } },
  ];
  if (cursorMatch) pipeline.push({ $match: cursorMatch });
  pipeline.push(
    { $sort: { 'splits.shareAmount': direction, _id: direction } },
    { $limit: pageSize + 1 }
  );
  return pipeline;
}
