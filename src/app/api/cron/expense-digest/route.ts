import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense, User } from '@/models';
import { getEnv, getResendConfig } from '@/lib/env';
import { computeExpenseDigests, type TripExpenseDigestInput } from '@/lib/expenseDigest';
import { buildExpenseDigestEmail } from '@/lib/emailTemplates';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * 每日「新增支出」摘要（ROADMAP #9 Phase 2b）。每天由 Vercel Cron 觸發（見 vercel.json），
 * 彙整過去 24 小時各旅程的新支出，按收件者寄一封摘要 Email——**取代逐筆即時寄信**
 * （站內鈴鐺通知仍即時，見 lib/notify.ts EMAIL_DIGESTED_TYPES）。
 *
 * 安全與設計同 settlement-reminder：CRON_SECRET 驗證、Resend env-gated、批次撈後在
 * 記憶體分組（純函式 computeExpenseDigests，排除收件者自己新增的支出 + 已封存旅程）。
 */

export const dynamic = 'force-dynamic';

/** 回看窗：過去 24 小時（與每日排程對齊，無重疊/缺口）。 */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

type LeanExpense = {
  trip: { toString(): string };
  amount: number;
  description: string;
  createdBy?: { toString(): string } | null;
  payer?: { displayName?: string | null } | null;
};
type LeanTrip = {
  _id: { toString(): string };
  name: string;
  members: { user: { toString(): string }; archivedAt?: Date | null }[];
};
type LeanUser = {
  _id: { toString(): string };
  email?: string | null;
  notifyByEmail?: boolean | null;
  locale?: string | null;
  isVirtual?: boolean | null;
};

export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 503 }
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const resend = getResendConfig();
  if (!resend) {
    return NextResponse.json({ success: false, error: 'Email not configured' }, { status: 503 });
  }

  try {
    await dbConnect();

    // 1. 過去 24h 新增的支出（含付款人顯示名供摘要顯示）
    const since = new Date(Date.now() - LOOKBACK_MS);
    const expenses = await Expense.find({ createdAt: { $gte: since } })
      .select('trip amount description createdBy payer')
      .populate('payer', 'displayName')
      .lean<LeanExpense[]>();
    if (expenses.length === 0) {
      return NextResponse.json({ success: true, expenses: 0, usersNotified: 0, emailsSent: 0 });
    }

    // 2. 依 trip 分組支出
    const expByTrip = new Map<string, TripExpenseDigestInput['expenses']>();
    for (const e of expenses) {
      const id = e.trip.toString();
      const list = expByTrip.get(id) ?? [];
      list.push({
        createdBy: e.createdBy ? e.createdBy.toString() : null,
        description: e.description,
        amount: e.amount,
        payerName: e.payer?.displayName ?? '',
      });
      expByTrip.set(id, list);
    }

    // 3. 載入相關旅程（取成員 + 名稱）
    const trips = await Trip.find({ _id: { $in: [...expByTrip.keys()] } })
      .select('name members')
      .lean<LeanTrip[]>();

    const tripInputs: TripExpenseDigestInput[] = trips.map((t) => {
      const id = t._id.toString();
      return {
        tripId: id,
        tripName: t.name,
        members: (t.members || []).map((m) => ({
          userId: m.user.toString(),
          archivedAt: m.archivedAt ?? null,
        })),
        expenses: expByTrip.get(id) ?? [],
      };
    });

    const digests = computeExpenseDigests(tripInputs);
    if (digests.size === 0) {
      return NextResponse.json({
        success: true,
        expenses: expenses.length,
        usersNotified: 0,
        emailsSent: 0,
      });
    }

    // 4. 收件者：真人 + 有信箱 + 未關閉 Email 通知
    const users = await User.find({ _id: { $in: [...digests.keys()] } })
      .select('email notifyByEmail locale isVirtual')
      .lean<LeanUser[]>();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    let emailsSent = 0;
    await Promise.all(
      [...digests.entries()].map(async ([userId, tripsList]) => {
        const u = byId.get(userId);
        if (!u || u.isVirtual || !u.email || u.notifyByEmail === false) return;
        try {
          const content = await buildExpenseDigestEmail({
            locale: u.locale ?? 'zh',
            appUrl: resend.appUrl,
            trips: tripsList,
          });
          if (await sendEmail({ to: u.email, content })) emailsSent++;
        } catch (error) {
          logger.error('expense digest email failed', error);
        }
      })
    );

    return NextResponse.json({
      success: true,
      expenses: expenses.length,
      usersNotified: digests.size,
      emailsSent,
    });
  } catch (error) {
    logger.error('expense digest cron error', error);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
