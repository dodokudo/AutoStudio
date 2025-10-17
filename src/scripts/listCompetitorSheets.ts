import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { google } from 'googleapis';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const COMPETITOR_SPREADSHEET_ID = '1AdMikjnk6OPLCi_iijeeFkRPvfRQgkIUCZy85u6_qdQ';

async function listSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId: COMPETITOR_SPREADSHEET_ID,
  });

  console.log('📊 スプレッドシート名:', response.data.properties?.title);
  console.log('\n全シートタブ一覧:');
  response.data.sheets?.forEach((sheet, index) => {
    const sheetName = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    const rowCount = sheet.properties?.gridProperties?.rowCount || 0;
    const colCount = sheet.properties?.gridProperties?.columnCount || 0;
    console.log(`${index + 1}. "${sheetName}" (gid=${sheetId}, ${rowCount}行 x ${colCount}列)`);
  });

  console.log('\n\n📝 現在のスクリプトが参照しているシート:');
  console.log('1. "対象者リスト" - 競合アカウント情報と日別メトリクス');
  console.log('2. "全体投稿" - 競合の投稿データ');

  console.log('\n\nユーザーが指定したgid: 1838127901');
  const targetSheet = response.data.sheets?.find(s => s.properties?.sheetId === 1838127901);
  if (targetSheet) {
    console.log(`→ このgidは "${targetSheet.properties?.title}" シートです`);
  } else {
    console.log('→ このgidのシートが見つかりません');
  }
}

listSheets().catch(console.error);
