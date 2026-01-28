/**
 * UnivaPay課金データをBigQueryに同期するスクリプト
 *
 * 使用方法:
 *   npm run sales:sync          # 全件同期
 *   npm run sales:sync -- --init # テーブル初期化 + 全件同期
 */
import 'dotenv/config';
import { listAllCharges } from '../lib/univapay/client';
import { initChargesTable, upsertCharges, getLastSyncedAt } from '../lib/sales/charges';

async function main() {
  const args = process.argv.slice(2);
  const shouldInit = args.includes('--init');

  console.log('='.repeat(60));
  console.log('[sync] UnivaPay -> BigQuery 同期開始');
  console.log('='.repeat(60));

  // テーブル初期化
  if (shouldInit) {
    console.log('\n[sync] テーブルを初期化中...');
    await initChargesTable();
    console.log('[sync] テーブル初期化完了');
  }

  // 最終同期日時を確認
  const lastSyncedAt = await getLastSyncedAt();
  if (lastSyncedAt) {
    console.log(`\n[sync] 最終同期: ${lastSyncedAt.toISOString()}`);
  } else {
    console.log('\n[sync] 初回同期（全件取得）');
  }

  // UnivaPayから全件取得
  console.log('\n[sync] UnivaPayからデータ取得中...');
  const startTime = Date.now();

  const charges = await listAllCharges({ mode: 'live' });

  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[sync] 取得完了: ${charges.length}件 (${fetchTime}秒)`);

  if (charges.length === 0) {
    console.log('[sync] 同期するデータがありません');
    return;
  }

  // 期間を表示
  const dates = charges.map(c => new Date(c.created_on));
  const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
  const newest = new Date(Math.max(...dates.map(d => d.getTime())));
  console.log(`[sync] データ期間: ${oldest.toISOString().split('T')[0]} ~ ${newest.toISOString().split('T')[0]}`);

  // ステータス別集計
  const statusCounts = charges.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('[sync] ステータス別:', statusCounts);

  // BigQueryに保存
  console.log('\n[sync] BigQueryに保存中...');
  const saveStartTime = Date.now();

  // バッチ処理（500件ずつ）
  const BATCH_SIZE = 500;
  let totalSaved = 0;

  for (let i = 0; i < charges.length; i += BATCH_SIZE) {
    const batch = charges.slice(i, i + BATCH_SIZE);
    const saved = await upsertCharges(batch);
    totalSaved += saved;
    console.log(`[sync] バッチ ${Math.floor(i / BATCH_SIZE) + 1}: ${saved}件保存`);
  }

  const saveTime = ((Date.now() - saveStartTime) / 1000).toFixed(1);
  console.log(`[sync] 保存完了: ${totalSaved}件 (${saveTime}秒)`);

  // 完了
  console.log('\n' + '='.repeat(60));
  console.log('[sync] 同期完了');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('[sync] エラー:', error);
  process.exit(1);
});
