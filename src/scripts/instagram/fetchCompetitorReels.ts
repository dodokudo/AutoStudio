#!/usr/bin/env tsx

import { config } from 'dotenv';
config({ path: '.env.local' });
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { ensureInstagramTables, createInstagramBigQuery } from '@/lib/instagram/bigquery';
import { listActiveCompetitors } from '@/lib/instagram/competitors';
import { loadInstagramConfig } from '@/lib/instagram/config';

async function main(): Promise<void> {
  const instagramConfig = loadInstagramConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const bigquery = createInstagramBigQuery();

  console.log('[instagram/fetch] Starting competitor reel fetch');
  await ensureInstagramTables(bigquery);

  const competitors = await listActiveCompetitors(bigquery);
  if (competitors.length === 0) {
    console.warn('[instagram/fetch] No active competitors found');
    return;
  }

  const competitorUsernames = new Set(competitors.map(c => c.username));
  console.log(`[instagram/fetch] Found ${competitorUsernames.size} active competitors`);

  const folderId = process.env.IG_COMPETITOR_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('IG_COMPETITOR_DRIVE_FOLDER_ID environment variable is not set');
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);

  console.log(`[instagram/fetch] Fetching videos from Drive folder: ${folderId}`);

  // Fetch all videos from the shared folder
  let pageToken: string | undefined;
  let totalVideos = 0;
  const allRows: any[] = [];

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov')`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
      pageSize: 1000,
      pageToken,
    });

    const files = response.data.files || [];
    totalVideos += files.length;

    // Process files and group by competitor
    for (const file of files) {
      if (!file.name || !file.mimeType?.startsWith('video/')) continue;

      // Extract username from filename: YYYY-MM-DD_{username}.mp4
      const match = file.name.match(/^\d{4}-\d{2}-\d{2}_(.+)\.(mp4|mov)$/i);
      if (!match || !match[1]) continue;

      const username = match[1];

      // Only include videos for active competitors
      if (!competitorUsernames.has(username)) continue;

      allRows.push({
        snapshot_date: snapshotDate,
        drive_file_id: file.id ?? '',
        drive_file_url: file.webViewLink ?? '',
        username,
        instagram_media_id: file.name.replace(/\.[^.]+$/, ''), // Full filename without extension
        caption: null,
        permalink: `https://instagram.com/${username}`,
        media_type: 'REEL',
        posted_at: file.createdTime ?? new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  console.log(`[instagram/fetch] Found ${totalVideos} total videos, ${allRows.length} for active competitors`);

  if (allRows.length === 0) {
    console.log('[instagram/fetch] No videos to insert');
    return;
  }

  // Insert all rows into BigQuery
  const dataset = bigquery.dataset(instagramConfig.dataset);
  const table = dataset.table('competitor_reels_raw');

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);
    await table.insert(batch, { raw: false, ignoreUnknownValues: true });
    console.log(`[instagram/fetch] Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows`);
  }

  // Group by competitor for summary
  const byCompetitor = new Map<string, number>();
  allRows.forEach(row => {
    byCompetitor.set(row.username, (byCompetitor.get(row.username) || 0) + 1);
  });

  console.log('\n[instagram/fetch] Summary:');
  byCompetitor.forEach((count, username) => {
    console.log(`  ${username}: ${count} videos`);
  });

  console.log(`\n[instagram/fetch] Completed: ${allRows.length} total videos inserted`);
}

main().catch((error) => {
  console.error('[instagram/fetch] Failed', error);
  process.exitCode = 1;
});
