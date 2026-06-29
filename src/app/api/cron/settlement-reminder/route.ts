import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense, Payment, User } from '@/models';
import { getEnv, getResendConfig } from '@/lib/env';
import { computeSettlementDigests, type TripSettlementInput } from '@/lib/settlementReminder';
import { buildSettlementReminderEmail } from '@/lib/emailTemplates';
import { sendEmailBatch } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * 排程結算提醒（ROADMAP #9 Phase 2b）。每週由 Vercel Cron 觸發（見 vercel.json），
 * 彙整每位使用者跨旅程的未結清淨額，各寄一封提醒 Email。
 *
 * 安全：以 `CRON_SECRET` 驗證——Vercel 觸發 cron 時自動帶
 * `Authorization: Bearer <CRON_SECRET>`。未設定 secret 時一律拒絕（避免被公開觸發）。
 *
 * 設計：批次任務，一次撈出全部 trip/expense/payment 後在記憶體分組計算（純函式
 * computeSettlementDigests）。資料量很大時可改為游標分頁；目前規模採簡單作法。
 * 寄信沿用 lib/email.ts（best-effort、env-gated）。
 */

// 動態執行，避免被靜態化或快取。
export const dynamic = 'force-dynamic';

type LeanTrip = {
  _id: { toString(): string };
  name: string;
  members: { user: { toString(): string }; archivedAt?: Date | null }[];
};
type LeanExpense = {
  trip: { toString(): string };
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};
type LeanPayment = {
  trip: { toString(): string };
  from: { toString(): string };
  to: { toString(): string };
  amount: number;
};
type LeanUser = {
  _id: { toString(): string };
  email?: string | null;
  notifyByEmail?: boolean | null;
  locale?: string | null;
  isVirtual?: boolean | null;
};

export async function GET(req: NextRequest) {
  // 1. 驗證 cron secret（未設定時拒絕，避免端點被公開觸發）
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

  // 2. Resend 未設定就沒有寄信意義
  const resend = getResendConfig();
  if (!resend) {
    return NextResponse.json({ success: false, error: 'Email not configured' }, { status: 503 });
  }

  try {
    await dbConnect();

    // 3. 批次撈出所有旅程 / 支出 / 還款，記憶體中依 trip 分組
    const [trips, expenses, payments] = await Promise.all([
      Trip.find().select('name members').lean<LeanTrip[]>(),
      Expense.find().select('trip payer amount splits').lean<LeanExpense[]>(),
      Payment.find().select('trip from to amount').lean<LeanPayment[]>(),
    ]);

    const expByTrip = new Map<string, TripSettlementInput['expenses']>();
    for (const e of expenses) {
      const id = e.trip.toString();
      const list = expByTrip.get(id) ?? [];
      list.push({
        payer: e.payer.toString(),
        amount: e.amount,
        splits: (e.splits || []).map((s) => ({
          user: s.user.toString(),
          shareAmount: s.shareAmount,
        })),
      });
      expByTrip.set(id, list);
    }

    const payByTrip = new Map<string, TripSettlementInput['payments']>();
    for (const p of payments) {
      const id = p.trip.toString();
      const list = payByTrip.get(id) ?? [];
      list.push({ from: p.from.toString(), to: p.to.toString(), amount: p.amount });
      payByTrip.set(id, list);
    }

    const tripInputs: TripSettlementInput[] = trips.map((t) => {
      const id = t._id.toString();
      return {
        tripId: id,
        tripName: t.name,
        members: (t.members || []).map((m) => ({
          userId: m.user.toString(),
          archivedAt: m.archivedAt ?? null,
        })),
        expenses: expByTrip.get(id) ?? [],
        payments: payByTrip.get(id) ?? [],
      };
    });

    const digests = computeSettlementDigests(tripInputs);
    if (digests.size === 0) {
      return NextResponse.json({ success: true, usersNotified: 0, emailsSent: 0 });
    }

    // 4. 撈出收件者：真人 + 有信箱 + 未關閉 Email 通知
    const users = await User.find({ _id: { $in: [...digests.keys()] } })
      .select('email notifyByEmail locale isVirtual')
      .lean<LeanUser[]>();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    // 逐人組出在地化提醒內容後，一次 batch 寄出（避免併發撞上 Resend 2 req/s 限制）。
    const messages = (
      await Promise.all(
        [...digests.entries()].map(async ([userId, tripsList]) => {
          const u = byId.get(userId);
          if (!u || u.isVirtual || !u.email || u.notifyByEmail === false) return null;
          try {
            const content = await buildSettlementReminderEmail({
              locale: u.locale ?? 'zh',
              appUrl: resend.appUrl,
              trips: tripsList,
            });
            return { to: u.email, content };
          } catch (error) {
            logger.error('settlement reminder email failed', error);
            return null;
          }
        })
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);

    const emailsSent = await sendEmailBatch(messages);

    return NextResponse.json({ success: true, usersNotified: digests.size, emailsSent });
  } catch (error) {
    logger.error('settlement reminder cron error', error);
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
