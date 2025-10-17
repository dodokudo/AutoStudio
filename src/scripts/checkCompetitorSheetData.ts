import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { SheetsClient } from '../lib/googleSheets';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const COMPETITOR_SPREADSHEET_ID = '1AdMikjnk6OPLCi_iijeeFkRPvfRQgkIUCZy85u6_qdQ';
const COMPETITOR_ALL_POSTS_SHEET = '全体投稿';

async function checkSheetData() {
  const sheetsClient = new SheetsClient({ spreadsheetId: COMPETITOR_SPREADSHEET_ID });

  console.log('📊 「全体投稿」シートのデータを確認中...\n');

  // 最初の100行を取得
  const values = await sheetsClient.getSheetValues(`'${COMPETITOR_ALL_POSTS_SHEET}'!A1:Z100`);

  if (!values.length) {
    console.log('❌ データが見つかりません');
    return;
  }

  const header = values[0];
  console.log('ヘッダー:', header.join(', '));
  console.log('');

  // 投稿日の列を探す
  const dateIdx = header.indexOf('投稿日');
  const accountIdx = header.indexOf('投稿者');
  const contentIdx = header.indexOf('投稿内容');

  if (dateIdx === -1) {
    console.log('❌ 投稿日列が見つかりません');
    return;
  }

  console.log(`投稿日列: ${dateIdx}, 投稿者列: ${accountIdx}\n`);

  // 最新の10行を表示
  console.log('📝 最新の10行のデータ:');
  const dataRows = values.slice(1, 11);
  dataRows.forEach((row, index) => {
    const date = row[dateIdx] || '(日付なし)';
    const account = row[accountIdx] || '(投稿者なし)';
    const content = row[contentIdx] ? row[contentIdx].substring(0, 50) + '...' : '(内容なし)';
    console.log(`${index + 1}. ${date} | ${account} | ${content}`);
  });

  // 全データの投稿日範囲を確認
  console.log('\n\n📅 全データの日付範囲を確認中...');
  const dates = values.slice(1)
    .map(row => row[dateIdx])
    .filter(d => d && d.trim())
    .sort();

  if (dates.length > 0) {
    console.log(`最も古い投稿日: ${dates[0]}`);
    console.log(`最も新しい投稿日: ${dates[dates.length - 1]}`);
    console.log(`総行数（ヘッダー除く）: ${values.length - 1}`);
  }

  // 10月9日以降のデータをカウント
  const oct9Later = values.slice(1).filter(row => {
    const date = row[dateIdx];
    return date && date >= '2025-10-09';
  });

  console.log(`\n10月9日以降のデータ: ${oct9Later.length}件`);

  if (oct9Later.length > 0) {
    console.log('\n✅ 10月9日以降のデータが存在します！');
    console.log('最新の3件:');
    oct9Later.slice(0, 3).forEach((row, index) => {
      const date = row[dateIdx];
      const account = row[accountIdx] || '(投稿者なし)';
      console.log(`  ${index + 1}. ${date} | ${account}`);
    });
  } else {
    console.log('\n❌ 10月9日以降のデータがありません');
  }
}

checkSheetData().catch(console.error);
