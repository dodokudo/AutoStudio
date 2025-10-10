import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { google } from 'googleapis';
import { createInstagramBigQuery } from '@/lib/instagram/bigquery';
import { loadInstagramConfig } from '@/lib/instagram';

const FOLDER_ID = process.env.IG_COMPETITOR_DRIVE_FOLDER_ID;

async function main() {
  if (!FOLDER_ID) {
    console.error('IG_COMPETITOR_DRIVE_FOLDER_ID is not set');
    return;
  }

  // Initialize Google Drive API
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  console.log('Fetching video files from Drive...\n');

  // Fetch all video files from the folder
  const response = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov')`,
    fields: 'files(id, name)',
    pageSize: 1000,
  });

  const files = response.data.files || [];
  console.log(`Found ${files.length} video files\n`);

  // Extract unique usernames from file names
  // File naming pattern: YYYY-MM-DD_{username}.mp4
  const usernameSet = new Set<string>();

  files.forEach(file => {
    if (!file.name) return;

    // Extract username from filename
    // Pattern: 2025-10-10_mon_guchi.mp4 -> mon_guchi
    const match = file.name.match(/^\d{4}-\d{2}-\d{2}_(.+)\.(mp4|mov)$/i);
    if (match && match[1]) {
      usernameSet.add(match[1]);
    }
  });

  const usernames = Array.from(usernameSet).sort();
  console.log(`Found ${usernames.length} unique competitor usernames:\n`);
  usernames.forEach(username => console.log(`  - ${username}`));

  // Add competitors to BigQuery
  console.log('\nAdding competitors to BigQuery...\n');

  const instagramConfig = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();
  const datasetId = instagramConfig.dataset;
  const tableId = 'instagram_competitors_private';

  // Check existing competitors
  const checkQuery = `
    SELECT username
    FROM \`${instagramConfig.projectId}.${datasetId}.${tableId}\`
  `;

  const [existingRows] = await bigquery.query({ query: checkQuery });
  const existingUsernames = new Set(existingRows.map((row: { username: string }) => row.username));

  // Prepare rows to insert
  const rowsToInsert = usernames
    .filter(username => !existingUsernames.has(username))
    .map(username => ({
      username,
      drive_folder_id: FOLDER_ID,
      category: null,
      active: true,
      created_at: new Date().toISOString(),
    }));

  if (rowsToInsert.length === 0) {
    console.log('✅ All competitors already exist in BigQuery');
  } else {
    console.log(`Inserting ${rowsToInsert.length} new competitor(s)...\n`);

    const table = bigquery.dataset(datasetId).table(tableId);
    await table.insert(rowsToInsert);

    console.log('✅ Competitors added successfully:');
    rowsToInsert.forEach(row => console.log(`  - ${row.username}`));
  }

  console.log('\n📊 Summary:');
  console.log(`  Total videos: ${files.length}`);
  console.log(`  Unique competitors: ${usernames.length}`);
  console.log(`  New competitors added: ${rowsToInsert.length}`);
}

main().catch(console.error);
