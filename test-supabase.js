// 測試 Supabase 連接
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 檢查環境變數...');
console.log('URL:', supabaseUrl ? '✅ 已設定' : '❌ 未設定');
console.log('Key:', supabaseKey ? '✅ 已設定' : '❌ 未設定');

if (!supabaseUrl || !supabaseKey) {
  console.log('\n❌ 環境變數未正確設定!');
  process.exit(1);
}

console.log('\n📡 測試 Supabase 連接...');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // 測試查詢 users 表
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      console.log('\n⚠️ 查詢錯誤:', error.message);
      console.log('\n可能的原因:');
      console.log('1. 資料表尚未建立 - 請在 Supabase SQL Editor 執行建表 SQL');
      console.log('2. Row Level Security 未關閉 - 請執行 ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
      return false;
    }

    console.log('\n✅ Supabase 連接成功!');
    console.log('✅ users 表可以正常查詢');
    return true;
  } catch (err) {
    console.log('\n❌ 連接失敗:', err.message);
    return false;
  }
}

testConnection().then((success) => {
  if (success) {
    console.log('\n🎉 所有測試通過!可以啟動開發伺服器了: npm run dev');
  } else {
    console.log('\n⚠️ 請先完成 Supabase 設定,參考 SUPABASE_SETUP.md');
  }
  process.exit(success ? 0 : 1);
});
