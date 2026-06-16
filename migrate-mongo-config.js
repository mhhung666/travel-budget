// migrate-mongo 設定（ESM）。
// 連線資訊一律取自環境變數，與應用程式共用同一個 MONGODB_URI；
// 不在此檔硬編碼任何憑證。
import 'dotenv/config';

const url = process.env.MONGODB_URI;
if (!url) {
  throw new Error(
    'MONGODB_URI is not set. migrate-mongo reads the same connection string as the app; ' +
      'define it in .env or the environment before running migrations.'
  );
}

const config = {
  mongodb: {
    url,
    // 留空則使用連線字串內的資料庫名稱（MONGODB_URI 已含 /travel-budget）。
    // 需要覆寫時可設定 MONGODB_DB。
    databaseName: process.env.MONGODB_DB || undefined,
    options: {},
  },

  // 遷移腳本目錄
  migrationsDir: 'migrations',

  // 已套用遷移的紀錄集合
  changelogCollectionName: 'changelog',

  // 併發鎖集合（避免多個 runner 同時遷移）
  lockCollectionName: 'changelog_lock',
  lockTtl: 0,

  // 專案為 ESM（package.json "type": "module"），故腳本用 .js + export
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm',
};

export default config;
