import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { google } from 'googleapis';
import { createInstagramBigQuery } from '../../lib/instagram/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

interface InstagramInsight {
  date: string;
  followers_count: number;
  posts_count: number;
  reach: number;
  engagement: number;
  profile_views: number;
  website_clicks: number;
}

interface ThreadsInsight {
  date: string;
  followers_count: number;
  profile_views: number;
  likes: number;
  replies: number;
  reposts: number;
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Fetch Instagram insights
  console.log('[sync-insights] Fetching Instagram insights from spreadsheet...');
  const igResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Instagram insight!A2:G',  // Skip header row
  });

  const igRows = igResponse.data.values ?? [];
  const igInsights: InstagramInsight[] = igRows
    .filter((row) => row[0] && row[0].match(/^\d{4}-\d{2}-\d{2}$/))  // Valid date format
    .map((row) => ({
      date: row[0],
      followers_count: Number(row[1] ?? 0),
      posts_count: Number(row[2] ?? 0),
      reach: Number(row[3] ?? 0),
      engagement: Number(row[4] ?? 0),
      profile_views: Number(row[5] ?? 0),
      website_clicks: Number(row[6] ?? 0),
    }));

  console.log(`[sync-insights] Found ${igInsights.length} Instagram insight rows`);

  // Fetch Threads insights
  console.log('[sync-insights] Fetching Threads insights from spreadsheet...');
  const threadsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Threads!A2:F',  // Skip header row
  });

  const threadsRows = threadsResponse.data.values ?? [];
  const threadsInsights: ThreadsInsight[] = threadsRows
    .filter((row) => row[0] && row[0].match(/^\d{4}-\d{2}-\d{2}$/))
    .map((row) => ({
      date: row[0],
      followers_count: Number(row[1] ?? 0),
      profile_views: Number(row[2] ?? 0),
      likes: Number(row[3] ?? 0),
      replies: Number(row[4] ?? 0),
      reposts: Number(row[5] ?? 0),
    }));

  console.log(`[sync-insights] Found ${threadsInsights.length} Threads insight rows`);

  // Insert to BigQuery
  const bigquery = createInstagramBigQuery();
  const projectId = process.env.IG_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID ?? 'mark-454114';
  const dataset = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';

  // Create instagram_insights table if not exists
  const tableId = 'instagram_insights';
  const table = bigquery.dataset(dataset).table(tableId);

  const [exists] = await table.exists();
  if (!exists) {
    console.log(`[sync-insights] Creating table ${dataset}.${tableId}...`);
    await bigquery.dataset(dataset).createTable(tableId, {
      schema: [
        { name: 'date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'followers_count', type: 'INT64', mode: 'NULLABLE' },
        { name: 'posts_count', type: 'INT64', mode: 'NULLABLE' },
        { name: 'reach', type: 'INT64', mode: 'NULLABLE' },
        { name: 'engagement', type: 'INT64', mode: 'NULLABLE' },
        { name: 'profile_views', type: 'INT64', mode: 'NULLABLE' },
        { name: 'website_clicks', type: 'INT64', mode: 'NULLABLE' },
      ],
    });
    console.log(`[sync-insights] Table created successfully`);
  }

  // Insert Instagram insights
  if (igInsights.length > 0) {
    console.log(`[sync-insights] Inserting ${igInsights.length} Instagram insights...`);

    // Use MERGE to upsert (update existing, insert new)
    const query = `
      MERGE \`${projectId}.${dataset}.${tableId}\` T
      USING UNNEST(@rows) S
      ON T.date = PARSE_DATE('%Y-%m-%d', S.date)
      WHEN MATCHED THEN
        UPDATE SET
          followers_count = S.followers_count,
          posts_count = S.posts_count,
          reach = S.reach,
          engagement = S.engagement,
          profile_views = S.profile_views,
          website_clicks = S.website_clicks
      WHEN NOT MATCHED THEN
        INSERT (date, followers_count, posts_count, reach, engagement, profile_views, website_clicks)
        VALUES (PARSE_DATE('%Y-%m-%d', date), followers_count, posts_count, reach, engagement, profile_views, website_clicks)
    `;

    await bigquery.query({
      query,
      params: { rows: igInsights },
      location: process.env.IG_GCP_LOCATION ?? 'asia-northeast1',
    });

    console.log('[sync-insights] Instagram insights synced successfully');
  }

  // Create threads_insights table if not exists
  const threadsTableId = 'threads_insights';
  const threadsTable = bigquery.dataset(dataset).table(threadsTableId);

  const [threadsExists] = await threadsTable.exists();
  if (!threadsExists) {
    console.log(`[sync-insights] Creating table ${dataset}.${threadsTableId}...`);
    await bigquery.dataset(dataset).createTable(threadsTableId, {
      schema: [
        { name: 'date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'followers_count', type: 'INT64', mode: 'NULLABLE' },
        { name: 'profile_views', type: 'INT64', mode: 'NULLABLE' },
        { name: 'likes', type: 'INT64', mode: 'NULLABLE' },
        { name: 'replies', type: 'INT64', mode: 'NULLABLE' },
        { name: 'reposts', type: 'INT64', mode: 'NULLABLE' },
      ],
    });
    console.log(`[sync-insights] Threads table created successfully`);
  }

  // Insert Threads insights
  if (threadsInsights.length > 0) {
    console.log(`[sync-insights] Inserting ${threadsInsights.length} Threads insights...`);

    const threadsQuery = `
      MERGE \`${projectId}.${dataset}.${threadsTableId}\` T
      USING UNNEST(@rows) S
      ON T.date = PARSE_DATE('%Y-%m-%d', S.date)
      WHEN MATCHED THEN
        UPDATE SET
          followers_count = S.followers_count,
          profile_views = S.profile_views,
          likes = S.likes,
          replies = S.replies,
          reposts = S.reposts
      WHEN NOT MATCHED THEN
        INSERT (date, followers_count, profile_views, likes, replies, reposts)
        VALUES (PARSE_DATE('%Y-%m-%d', date), followers_count, profile_views, likes, replies, reposts)
    `;

    await bigquery.query({
      query: threadsQuery,
      params: { rows: threadsInsights },
      location: process.env.IG_GCP_LOCATION ?? 'asia-northeast1',
    });

    console.log('[sync-insights] Threads insights synced successfully');
  }

  console.log('[sync-insights] All insights synced successfully!');
}

main().catch((error) => {
  console.error('[sync-insights] Failed:', error);
  process.exitCode = 1;
});
