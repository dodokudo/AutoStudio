import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { google } from 'googleapis';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  console.log('Available sheets:');
  metadata.data.sheets?.forEach((sheet) => {
    console.log(`- ${sheet.properties?.title} (sheetId: ${sheet.properties?.sheetId})`);
  });

  for (const sheet of metadata.data.sheets || []) {
    const sheetName = sheet.properties?.title;
    if (!sheetName) continue;

    try {
      const values = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z5`,
      });
      console.log(`\n=== ${sheetName} (first 5 rows) ===`);
      console.log(JSON.stringify(values.data.values, null, 2));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`\n=== ${sheetName} - Error: ${message} ===`);
    }
  }
}

main().catch(console.error);
