import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database.db');
const db = new Database(dbPath);

// 啟用外鍵約束
db.pragma('foreign_keys = ON');

// 初始化數據庫表
export function initDatabase() {
  // 用戶表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 旅行群組表
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 旅行成員表
  db.exec(`
    CREATE TABLE IF NOT EXISTS trip_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 支出記錄表
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      payer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 分帳記錄表
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      share_amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Database initialized successfully');
}

export default db;
