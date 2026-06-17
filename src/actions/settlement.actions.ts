'use server';

import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { calculateSettlement } from '@/lib/settlement';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Balance, Transaction } from '@/types';
import { logger } from '@/lib/logger';

interface SettlementResult {
  balances: Balance[];
  transactions: Transaction[];
  totalExpenses: number;
}

type PopulatedMember = {
  user: { _id: { toString(): string }; username: string; displayName: string } | null;
};

type LeanExpenseForSettlement = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

/**
 * Get settlement for a trip
 */
export const getSettlement = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<SettlementResult>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const tripId = membership.tripId;

      await dbConnect();

      // 一次取出成員 + 該行程全部支出（含內嵌 splits），其餘在記憶體計算
      const [trip, expenses] = await Promise.all([
        Trip.findById(tripId)
          .populate('members.user', 'username displayName')
          .select('members')
          .lean<{ members: PopulatedMember[] } | null>(),
        Expense.find({ trip: tripId })
          .select('payer amount splits')
          .lean<LeanExpenseForSettlement[]>(),
      ]);

      const members = (trip?.members || []).map((m) => m.user).filter((u) => u !== null);

      const paidByUser = new Map<string, number>();
      const owedByUser = new Map<string, number>();
      let totalExpenses = 0;

      for (const e of expenses) {
        totalExpenses += e.amount || 0;
        const payerId = e.payer.toString();
        paidByUser.set(payerId, (paidByUser.get(payerId) || 0) + (e.amount || 0));
        for (const s of e.splits || []) {
          const uid = s.user.toString();
          owedByUser.set(uid, (owedByUser.get(uid) || 0) + (s.shareAmount || 0));
        }
      }

      const balances: Balance[] = members.map((member) => {
        const id = member!._id.toString();
        const totalPaid = paidByUser.get(id) || 0;
        const totalOwed = owedByUser.get(id) || 0;
        return {
          userId: id,
          username: member!.displayName,
          totalPaid,
          totalOwed,
          balance: totalPaid - totalOwed,
        };
      });

      // Calculate transactions using settlement algorithm（傳入副本避免被改動）
      const transactions = calculateSettlement(balances.map((b) => ({ ...b })));

      return {
        success: true,
        data: {
          balances,
          transactions,
          totalExpenses,
        },
      };
    } catch (error) {
      logger.error('Get settlement error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
