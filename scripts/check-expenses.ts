import db from '../lib/db';

console.log('\n=== 旅行支出統計 ===\n');

// 查詢所有支出
const expenses = db.prepare(`
  SELECT e.id, e.amount, e.description, e.date,
         u.display_name as payer_name
  FROM expenses e
  INNER JOIN users u ON e.payer_id = u.id
  WHERE e.trip_id = 1
  ORDER BY e.date DESC, e.created_at DESC
`).all();

console.log('支出列表:');
console.table(expenses);

// 查詢每筆支出的分帳詳情
console.log('\n分帳詳情:\n');
expenses.forEach((expense: any) => {
  const splits = db.prepare(`
    SELECT u.display_name, es.share_amount
    FROM expense_splits es
    INNER JOIN users u ON es.user_id = u.id
    WHERE es.expense_id = ?
  `).all(expense.id);

  console.log(`${expense.description} ($${expense.amount}) - ${expense.payer_name} 付款:`);
  console.table(splits);
});

// 計算每個人的淨支出
console.log('\n每人統計:\n');
const members = db.prepare('SELECT id, display_name FROM users').all();

members.forEach((member: any) => {
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses
    WHERE payer_id = ? AND trip_id = 1
  `).get(member.id) as any;

  const totalOwed = db.prepare(`
    SELECT COALESCE(SUM(share_amount), 0) as total
    FROM expense_splits es
    INNER JOIN expenses e ON es.expense_id = e.id
    WHERE es.user_id = ? AND e.trip_id = 1
  `).get(member.id) as any;

  const balance = totalPaid.total - totalOwed.total;

  console.log(`${member.display_name}:`);
  console.log(`  總付款: $${totalPaid.total}`);
  console.log(`  總應付: $${totalOwed.total}`);
  console.log(`  淨餘額: ${balance >= 0 ? '+' : ''}$${balance} ${balance > 0 ? '(應收)' : balance < 0 ? '(應付)' : '(已結清)'}\n`);
});
