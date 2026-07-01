'use server';

import { Types } from 'mongoose';
import { Comment, Expense, User } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { createCommentSchema, type CreateCommentInput } from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { CommentDto } from '@/types';
import { logger } from '@/lib/logger';
import { toCommentDto, type CommentDtoInput } from '@/lib/dto';
import { notify } from '@/lib/notify';

/** 留言預覽長度（通知 meta 用，避免整段長留言塞進 Notification / Email 文件）。 */
const COMMENT_PREVIEW_LENGTH = 80;

function previewOf(body: string): string {
  return body.length > COMMENT_PREVIEW_LENGTH ? `${body.slice(0, COMMENT_PREVIEW_LENGTH)}…` : body;
}

/**
 * 取得某筆支出的留言串（舊到新，聊天式排序）。expense 須屬於此 trip，
 * 防止用他團的 expenseId 越權讀取。
 */
export const getComments = withAuth(
  async (session, tripIdOrCode: string, expenseId: string): Promise<ActionResult<CommentDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const { tripId } = membership;

      const expense = await Expense.findOne({ _id: expenseId, trip: tripId }).select('_id').lean();
      if (!expense) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const comments = await Comment.find({ expense: expenseId })
        .sort({ createdAt: 1 })
        .lean<CommentDtoInput[]>();
      return { success: true, data: comments.map(toCommentDto) };
    } catch (error) {
      logger.error('Get comments error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 取得某旅程內所有支出的留言數（{ expenseId: count }）。一次 aggregate 完成，
 * 避免支出列表逐筆各發一次查詢（N+1）；供支出卡片顯示「留言 (N)」而不必展開。
 */
export const getCommentCounts = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<Record<string, number>>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const rows = await Comment.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { trip: new Types.ObjectId(membership.tripId) } },
        { $group: { _id: '$expense', count: { $sum: 1 } } },
      ]);

      const counts: Record<string, number> = {};
      for (const row of rows) {
        counts[row._id.toString()] = row.count;
      }
      return { success: true, data: counts };
    } catch (error) {
      logger.error('Get comment counts error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 在某筆支出下新增留言。通知其他成員（best-effort），比照 expense_added 走即時
 * Email（不進 EMAIL_DIGESTED_TYPES 彙整）——留言屬即時互動語境，彙整會失去時效性。
 */
export const createComment = withAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string,
    input: CreateCommentInput
  ): Promise<ActionResult<CommentDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const { tripId } = membership;

      const expense = await Expense.findOne({ _id: expenseId, trip: tripId })
        .select('description')
        .lean<{ description: string } | null>();
      if (!expense) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = createCommentSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }
      const { body } = validation.data;

      // 去正規化留言者名稱（事件當下快照，讀取免 populate，比照 lib/activity.ts）
      const author = await User.findById(session.userId)
        .select('displayName')
        .lean<{ displayName: string } | null>();

      const created = await Comment.create({
        trip: tripId,
        expense: expenseId,
        author: session.userId,
        authorName: author?.displayName ?? '',
        body,
      });

      await notify({
        tripId,
        actorId: session.userId,
        type: 'expense_comment_added',
        meta: {
          expense_id: expenseId,
          comment_id: created._id.toString(),
          description: expense.description,
          comment_body: previewOf(body),
        },
      });

      return {
        success: true,
        data: toCommentDto(created.toObject() as unknown as CommentDtoInput),
      };
    } catch (error) {
      logger.error('Create comment error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 刪除一則留言。權限比其餘 data-level 刪除更嚴格：僅留言作者本人或旅程 admin
 * 可刪（留言的個人語意更接近聊天訊息，見 comment.actions.ts 設計取捨）。
 */
export const deleteComment = withAuth(
  async (
    session,
    tripIdOrCode: string,
    expenseId: string,
    commentId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const comment = await Comment.findOne({
        _id: commentId,
        expense: expenseId,
        trip: membership.tripId,
      })
        .select('author')
        .lean<{ author: { toString(): string } } | null>();
      if (!comment) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const isAuthor = comment.author.toString() === session.userId;
      if (!isAuthor && membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      await Comment.deleteOne({ _id: commentId });
      return { success: true, data: { message: 'Comment deleted' } };
    } catch (error) {
      logger.error('Delete comment error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
