/**
 * Phase 6 數據遷移腳本
 * 功能:
 * 1. 為所有現有旅行生成唯一的 hash_code
 * 2. 將旅行的第一個成員設為管理員 (假設為創建者)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config({ path: '.env' });

// 從環境變數讀取 Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 錯誤: 請設定 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 生成隨機 hash code
 */
function generateHashCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 檢查 hash code 是否已存在
 */
async function hashCodeExists(hashCode) {
  const { data, error } = await supabase
    .from('trips')
    .select('id')
    .eq('hash_code', hashCode)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw error;
  }

  return data !== null;
}

/**
 * 生成唯一的 hash code
 */
async function generateUniqueHashCode() {
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    const hashCode = generateHashCode(attempts >= 10 ? 8 : 6);
    const exists = await hashCodeExists(hashCode);

    if (!exists) {
      return hashCode;
    }

    attempts++;
  }

  throw new Error('無法生成唯一的 hash code');
}

/**
 * 為所有現有旅行生成 hash_code
 */
async function migrateTripsHashCode() {
  console.log('📋 開始為旅行生成 hash_code...\n');

  // 獲取所有沒有 hash_code 的旅行
  const { data: trips, error: fetchError } = await supabase
    .from('trips')
    .select('id, name')
    .is('hash_code', null);

  if (fetchError) {
    throw new Error(`獲取旅行失敗: ${fetchError.message}`);
  }

  if (!trips || trips.length === 0) {
    console.log('✅ 所有旅行都已有 hash_code,無需遷移\n');
    return;
  }

  console.log(`找到 ${trips.length} 個需要生成 hash_code 的旅行\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const trip of trips) {
    try {
      const hashCode = await generateUniqueHashCode();

      const { error: updateError } = await supabase
        .from('trips')
        .update({ hash_code: hashCode })
        .eq('id', trip.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ 旅行 "${trip.name}" (ID: ${trip.id}) -> hash_code: ${hashCode}`);
      successCount++;
    } catch (error) {
      console.error(`❌ 旅行 "${trip.name}" (ID: ${trip.id}) 失敗: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Hash Code 遷移完成:`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失敗: ${errorCount}\n`);
}

/**
 * 設定旅行的管理員
 * 策略: 將每個旅行中 joined_at 最早的成員設為管理員
 */
async function migrateTripAdmins() {
  console.log('👑 開始設定旅行管理員...\n');

  // 獲取所有旅行
  const { data: trips, error: fetchError } = await supabase
    .from('trips')
    .select('id, name');

  if (fetchError) {
    throw new Error(`獲取旅行失敗: ${fetchError.message}`);
  }

  if (!trips || trips.length === 0) {
    console.log('⚠️  沒有找到任何旅行\n');
    return;
  }

  console.log(`找到 ${trips.length} 個旅行需要設定管理員\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const trip of trips) {
    try {
      // 獲取該旅行中加入最早的成員
      const { data: members, error: membersError } = await supabase
        .from('trip_members')
        .select('id, user_id, role, joined_at')
        .eq('trip_id', trip.id)
        .order('joined_at', { ascending: true })
        .limit(1);

      if (membersError) {
        throw membersError;
      }

      if (!members || members.length === 0) {
        console.log(`⚠️  旅行 "${trip.name}" (ID: ${trip.id}) 沒有成員`);
        continue;
      }

      const firstMember = members[0];

      // 如果已經是管理員,跳過
      if (firstMember.role === 'admin') {
        console.log(`ℹ️  旅行 "${trip.name}" (ID: ${trip.id}) 已有管理員`);
        successCount++;
        continue;
      }

      // 將第一個成員設為管理員
      const { error: updateError } = await supabase
        .from('trip_members')
        .update({ role: 'admin' })
        .eq('id', firstMember.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ 旅行 "${trip.name}" (ID: ${trip.id}) -> 管理員: user_id ${firstMember.user_id}`);
      successCount++;
    } catch (error) {
      console.error(`❌ 旅行 "${trip.name}" (ID: ${trip.id}) 失敗: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 管理員設定完成:`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失敗: ${errorCount}\n`);
}

/**
 * 主要遷移流程
 */
async function main() {
  console.log('🚀 Phase 6 數據遷移開始\n');
  console.log('='.repeat(50));
  console.log('\n');

  try {
    // Step 1: 為旅行生成 hash_code
    await migrateTripsHashCode();

    console.log('='.repeat(50));
    console.log('\n');

    // Step 2: 設定旅行管理員
    await migrateTripAdmins();

    console.log('='.repeat(50));
    console.log('\n✨ 遷移完成!\n');
  } catch (error) {
    console.error('\n❌ 遷移失敗:', error);
    process.exit(1);
  }
}

// 執行遷移
main();
