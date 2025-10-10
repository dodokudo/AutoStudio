import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.IG_SPREADSHEET_ID ?? '1FcoxqF-W_cl1wZps_mmFffp0SJH0-KA';

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Get all sheet names first
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });

  console.log('Available sheets:');
  const sheetNames = spreadsheet.data.sheets?.map(sheet => sheet.properties?.title) || [];
  sheetNames.forEach(name => console.log(`  - ${name}`));

  console.log('\n--- Checking for competitor configuration ---\n');

  // Check each sheet for competitor data
  for (const sheetName of sheetNames) {
    if (!sheetName) continue;

    // Skip large data sheets
    if (sheetName.includes('rawdata') || sheetName.includes('insight')) continue;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:Z10`, // Read first 10 rows to check structure
      });

      const values = response.data.values;
      if (values && values.length > 0) {
        console.log(`\n[${sheetName}]`);
        console.log('First row (headers):', values[0]);
        if (values.length > 1) {
          console.log('Sample data:', values.slice(1, 3));
        }
      }
    } catch (error) {
      console.log(`  Error reading ${sheetName}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

main().catch(console.error);
