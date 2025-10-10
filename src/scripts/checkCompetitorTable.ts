import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createInstagramBigQuery } from '@/lib/instagram/bigquery';
import { loadInstagramConfig } from '@/lib/instagram';

async function main() {
  const instagramConfig = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();
  const datasetId = instagramConfig.dataset;

  console.log('Checking instagram_competitors_private table...\n');

  const query = `
    SELECT *
    FROM \`${instagramConfig.projectId}.${datasetId}.instagram_competitors_private\`
    ORDER BY created_at DESC
  `;

  try {
    const [rows] = await bigquery.query({ query });

    if (rows.length === 0) {
      console.log('❌ No competitors found in the table.');
      console.log('\nChecking Google Drive folder from environment variable...');
      console.log('IG_COMPETITOR_DRIVE_FOLDER_ID:', process.env.IG_COMPETITOR_DRIVE_FOLDER_ID);
    } else {
      console.log(`✅ Found ${rows.length} competitor(s):\n`);
      rows.forEach((row: { username: string; drive_folder_id: string; category: string; active: boolean; created_at: string }) => {
        console.log('Username:', row.username);
        console.log('Drive Folder ID:', row.drive_folder_id);
        console.log('Category:', row.category);
        console.log('Active:', row.active);
        console.log('Created At:', row.created_at);
        console.log('---');
      });
    }
  } catch (error) {
    console.error('Error querying table:', error instanceof Error ? error.message : String(error));
  }
}

main().catch(console.error);
