'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId, requireMember } from '@/lib/permissions';
import { calculateSettlement } from '@/lib/settlement';
import type { ActionResult } from './types';
import type { Balance, Transaction } from '@/types';

interface SettlementResult {
  balances: Balance[];
  transactions: Transaction[];
  totalExpenses: number;
}

/**
 * Get settlement for a trip
 */
export async function getSettlement(tripIdOrCode: string): Promise<ActionResult<SettlementResult>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }

    const tripId = await getTripId(tripIdOrCode);
    if (!tripId) {
      return { success: false, error: '旅行不存在', code: 'NOT_FOUND' };
    }

    // Check membership
    try {
      await requireMember(session.userId, tripId);
    } catch {
      return { success: false, error: '您不是此旅行的成員', code: 'FORBIDDEN' };
    }

    // Get all members
    const { data: membersData } = await supabase
      .from('trip_members')
      .select(
        `
        users!inner (
          id,
          username,
          display_name
        )
      `
      )
      .eq('trip_id', tripId);

    const members = membersData?.map((m: any) => m.users) || [];

    // Calculate balances for each member
    const balances = await Promise.all(
      members.map(async (member: any) => {
        // Total paid
        const { data: paidData } = await supabase
          .from('expenses')
          .select('amount')
          .eq('payer_id', member.id)
          .eq('trip_id', tripId);

        const totalPaid = paidData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

        // Total owed
        const { data: owedData } = await supabase
          .from('expense_splits')
          .select('share_amount, expenses!inner(trip_id)')
          .eq('user_id', member.id)
          .eq('expenses.trip_id', tripId);

        const totalOwed = owedData?.reduce((sum, s) => sum + (s.share_amount || 0), 0) || 0;

        const balance = totalPaid - totalOwed;

        return {
          userId: member.id,
          username: member.display_name,
          totalPaid,
          totalOwed,
          balance,
        };
      })
    );

    // Calculate transactions using settlement algorithm
    const balancesForCalculation = balances.map((b) => ({ ...b }));
    const transactions = calculateSettlement(balancesForCalculation);

    // Calculate total expenses
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('amount')
      .eq('trip_id', tripId);

    const totalExpenses = expensesData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

    return {
      success: true,
      data: {
        balances,
        transactions,
        totalExpenses,
      },
    };
  } catch (error) {
    console.error('Get settlement error:', error);
    return { success: false, error: '獲取結算信息失敗', code: 'INTERNAL_ERROR' };
  }
}
