#!/usr/bin/env tsx

import 'dotenv/config';
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { ensureInstagramTables, createInstagramBigQuery } from '@/lib/instagram/bigquery';
import { listActiveCompetitors } from '@/lib/instagram/competitors';
import { loadInstagramConfig } from '@/lib/instagram/config';

async function main(): Promise<void> {
  const config = loadInstagramConfig();
  const drive = google.drive({ version: 'v3' });
  const bigquery = createInstagramBigQuery();

  console.log('[instagram/fetch] Starting competitor reel fetch');
  await ensureInstagramTables(bigquery);

  const competitors = await listActiveCompetitors(bigquery);
  if (competitors.length === 0) {
    console.warn('[instagram/fetch] No active competitors found');
    return;
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);

  for (const competitor of competitors) {
    if (!competitor.driveFolderId) {
      console.warn(`[instagram/fetch] ${competitor.username} has no drive folder mapping; skipped`);
      continue;
    }

    console.log(`[instagram/fetch] Processing ${competitor.username}`);
    await syncDriveFolder({
      drive,
      bigquery,
      competitor: competitor.username,
      folderId: competitor.driveFolderId,
      snapshotDate,
    });
  }
  console.log('[instagram/fetch] Completed');
}

interface SyncDriveParams {
  drive: ReturnType<typeof google.drive>;
  bigquery: BigQuery;
  competitor: string;
  folderId: string;
  snapshotDate: string;
}

async function syncDriveFolder(params: SyncDriveParams): Promise<void> {
  const { drive, competitor, folderId, snapshotDate } = params;
  const files = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
    pageSize: 100,
  });

  if (!files.data.files?.length) {
    console.log(`[instagram/fetch] No files found for ${competitor}`);
    return;
  }

  const rows = files.data.files
    .filter((file) => file.mimeType?.startsWith('video/'))
    .map((file) => ({
      snapshot_date: snapshotDate,
      drive_file_id: file.id ?? '',
      drive_file_url: file.webViewLink ?? '',
      username: competitor,
      instagram_media_id: extractMediaIdFromFilename(file.name ?? ''),
      caption: null,
      permalink: '',
      media_type: 'REEL',
      posted_at: file.createdTime ?? new Date().toISOString(),
    }))
    .filter((row) => row.drive_file_id);

  if (rows.length === 0) {
    console.log(`[instagram/fetch] No video rows to record for ${competitor}`);
    return;
  }

  const bigquery = params.bigquery;
  const config = loadInstagramConfig();
  const dataset = bigquery.dataset(config.dataset);
  const table = dataset.table('competitor_reels_raw');
  await table.insert(rows, { raw: false });
  console.log(`[instagram/fetch] Inserted ${rows.length} rows for ${competitor}`);
}

function extractMediaIdFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt;
}

main().catch((error) => {
  console.error('[instagram/fetch] Failed', error);
  process.exitCode = 1;
});
