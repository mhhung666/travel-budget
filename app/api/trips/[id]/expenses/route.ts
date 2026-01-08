import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

// 獲取旅行的所有支出
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;
    const tripId = parseInt(id);

    // 檢查用戶是否是此旅行的成員
    const isMember = db.prepare(`
      SELECT id FROM trip_members
      WHERE trip_id = ? AND user_id = ?
    `).get(tripId, session.userId);

    if (!isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取所有支出及其分帳詳情
    const expenses = db.prepare(`
      SELECT e.id, e.amount, e.description, e.date, e.created_at,
             u.id as payer_id, u.username as payer_username, u.display_name as payer_name
      FROM expenses e
      INNER JOIN users u ON e.payer_id = u.id
      WHERE e.trip_id = ?
      ORDER BY e.date DESC, e.created_at DESC
    `).all(tripId) as any[];

    // 為每個支出獲取分帳詳情
    const expensesWithSplits = expenses.map(expense => {
      const splits = db.prepare(`
        SELECT es.user_id, es.share_amount, u.username, u.display_name
        FROM expense_splits es
        INNER JOIN users u ON es.user_id = u.id
        WHERE es.expense_id = ?
      `).all(expense.id);

      return {
        ...expense,
        splits,
      };
    });

    return NextResponse.json({ expenses: expensesWithSplits });
  } catch (error) {
    console.error('Get expenses error:', error);
    return NextResponse.json(
      { error: '獲取支出列表失敗' },
      { status: 500 }
    );
  }
}

// 新增支出
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;
    const tripId = parseInt(id);

    // 檢查用戶是否是此旅行的成員
    const isMember = db.prepare(`
      SELECT id FROM trip_members
      WHERE trip_id = ? AND user_id = ?
    `).get(tripId, session.userId);

    if (!isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { payer_id, amount, description, date, split_with } = body;

    // 驗證輸入
    if (!payer_id || !amount || !description || !date || !split_with || split_with.length === 0) {
      return NextResponse.json(
        { error: '所有欄位都是必填的' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: '金額必須大於 0' },
        { status: 400 }
      );
    }

    // 驗證 payer 和所有 split_with 成員都在旅行中
    const memberIds = db.prepare(`
      SELECT user_id FROM trip_members WHERE trip_id = ?
    `).all(tripId).map((m: any) => m.user_id);

    if (!memberIds.includes(payer_id)) {
      return NextResponse.json(
        { error: '付款人不是旅行成員' },
        { status: 400 }
      );
    }

    for (const userId of split_with) {
      if (!memberIds.includes(userId)) {
        return NextResponse.json(
          { error: '分帳對象必須都是旅行成員' },
          { status: 400 }
        );
      }
    }

    // 計算每人應分擔金額
    const shareAmount = amount / split_with.length;

    // 使用事務創建支出和分帳記錄
    const createExpense = db.transaction(() => {
      // 創建支出記錄
      const result = db.prepare(`
        INSERT INTO expenses (trip_id, payer_id, amount, description, date)
        VALUES (?, ?, ?, ?, ?)
      `).run(tripId, payer_id, amount, description, date);

      const expenseId = result.lastInsertRowid;

      // 創建分帳記錄
      const insertSplit = db.prepare(`
        INSERT INTO expense_splits (expense_id, user_id, share_amount)
        VALUES (?, ?, ?)
      `);

      for (const userId of split_with) {
        insertSplit.run(expenseId, userId, shareAmount);
      }

      return expenseId;
    });

    const expenseId = createExpense();

    // 獲取完整的支出信息
    const expense = db.prepare(`
      SELECT e.id, e.amount, e.description, e.date, e.created_at,
             u.id as payer_id, u.username as payer_username, u.display_name as payer_name
      FROM expenses e
      INNER JOIN users u ON e.payer_id = u.id
      WHERE e.id = ?
    `).get(expenseId);

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error('Create expense error:', error);
    return NextResponse.json(
      { error: '新增支出失敗' },
      { status: 500 }
    );
  }
}
