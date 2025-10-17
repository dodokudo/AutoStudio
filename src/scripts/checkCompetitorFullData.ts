import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { SheetsClient } from '../lib/googleSheets';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const COMPETITOR_SPREADSHEET_ID = '1AdMikjnk6OPLCi_iijeeFkRPvfRQgkIUCZy85u6_qdQ';
const COMPETITOR_ALL_POSTS_SHEET = '全体投稿';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Handle formats like "2025/10/15", "2025-10-15", etc.
  const cleaned = dateStr.replace(/[年月]/g, '/').replace(/日/g, '').trim();

  try {
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

async function checkFullData() {
  const sheetsClient = new SheetsClient({ spreadsheetId: COMPETITOR_SPREADSHEET_ID });

  console.log('📊 「全体投稿」シートの全データを確認中...\n');

  // 全データを取得（2372行）
  const values = await sheetsClient.getSheetValues(`'${COMPETITOR_ALL_POSTS_SHEET}'!A1:H2400`);

  if (!values.length) {
    console.log('❌ データが見つかりません');
    return;
  }

  const header = values[0];
  const dateIdx = header.indexOf('投稿日');
  const accountIdx = header.indexOf('投稿者');

  console.log(`総行数: ${values.length - 1}行（ヘッダー除く）\n`);

  // 日付でソート
  const dataWithDates = values.slice(1)
    .map((row, index) => ({
      rowNum: index + 2,
      date: row[dateIdx],
      parsedDate: parseDate(row[dateIdx]),
      account: row[accountIdx],
    }))
    .filter(item => item.parsedDate !== null)
    .sort((a, b) => (b.parsedDate!.getTime() - a.parsedDate!.getTime()));

  console.log('📅 最新の20件の投稿:');
  dataWithDates.slice(0, 20).forEach((item, index) => {
    console.log(`${index + 1}. ${item.date} | ${item.account} (行 ${item.rowNum})`);
  });

  console.log(`\n\n最も新しい投稿日: ${dataWithDates[0]?.date}`);
  console.log(`最も古い投稿日: ${dataWithDates[dataWithDates.length - 1]?.date}`);

  // 10月以降のデータをカウント
  const oct2025 = new Date('2025-10-01');
  const octPosts = dataWithDates.filter(item => item.parsedDate! >= oct2025);

  console.log(`\n\n📊 10月のデータ統計:`);
  console.log(`10月以降の投稿数: ${octPosts.length}件`);

  if (octPosts.length > 0) {
    console.log('\n10月の最新10件:');
    octPosts.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.date} | ${item.account}`);
    });

    // 10月9日以降
    const oct9 = new Date('2025-10-09');
    const oct9Later = dataWithDates.filter(item => item.parsedDate! >= oct9);
    console.log(`\n10月9日以降の投稿数: ${oct9Later.length}件`);
  } else {
    console.log('\n❌ 10月のデータがありません');
  }
}

checkFullData().catch(console.error);
