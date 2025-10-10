import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.IG_SPREADSHEET_ID ?? '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  console.log('Available sheets:');
  spreadsheet.data.sheets?.forEach((sheet) => {
    console.log(`  - ${sheet.properties?.title}`);
  });
}

main().catch(console.error);
