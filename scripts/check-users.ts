import db from '../lib/db';

const users = db.prepare('SELECT id, username, display_name, created_at FROM users').all();

console.log('\n=== 數據庫用戶列表 ===\n');
console.table(users);
console.log(`\n總共 ${users.length} 個用戶\n`);
