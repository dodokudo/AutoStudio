import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { google } from 'googleapis';
import type { BigQuery } from '@google-cloud/bigquery';
import { createInstagramBigQuery, ensureInstagramTables } from '@/lib/instagram/bigquery';
import { loadInstagramConfig } from '@/lib/instagram/config';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.IG_SPREADSHEET_ID ?? '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';
const LOCATION = process.env.IG_GCP_LOCATION ?? 'asia-northeast1';

type SheetRow = string[] | undefined;

interface InsightRow {
  id: string;
  user_id: string;
  date: string;
  followers_count: number;
  posts_count: number;
  reach: number;
  engagement: number;
  profile_views: number;
  website_clicks: number;
}

interface ReelRow {
  id: string;
  user_id: string;
  instagram_id: string;
  caption: string;
  media_product_type: string;
  media_type: string;
  permalink: string;
  timestamp_iso: string;
  views: number;
  reach: number;
  total_interactions: number;
  like_count: number;
  comments_count: number;
  saved: number;
  shares: number;
  video_view_total_time_hours: string;
  avg_watch_time_seconds: number;
  drive_image_url: string;
  thumbnail_url: string;
}

interface StoryRow {
  id: string;
  user_id: string;
  instagram_id: string;
  drive_image_url: string;
  thumbnail_url: string;
  timestamp_iso: string;
  views: number;
  reach: number;
  replies: number;
  caption: string;
  total_interactions: number;
  follows: number;
  profile_visits: number;
  navigation: number;
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(value: string | undefined): number | null {
  const parsed = parseNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/年|月/g, '-')
    .replace(/日/g, '')
    .replace(/\//g, '-')
    .replace(/\./g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function toIsoFromJst(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/年|月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
    .replace(/T/, ' ')
    .replace(/\s+/g, ' ')
    .replace(/時|分|秒/g, ':');

  const match = normalized.match(
    /(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? '0');
  const minute = Number(match[5] ?? '0');
  const second = Number(match[6] ?? '0');

  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Spread sheet値はJST想定なのでUTCに変換するために9時間引く
  date.setUTCHours(date.getUTCHours() - 9);
  return date.toISOString();
}

function buildInsightRows(rows: SheetRow[], userId: string): InsightRow[] {
  const uniqueMap = new Map<string, InsightRow>();

  rows
    .map((row) => (Array.isArray(row) ? row : undefined))
    .map((row) => {
      if (!row) return null;
      const date = normaliseDate(row[0]);
      if (!date) return null;
      return {
        id: `${userId}_${date}`,
        user_id: userId,
        date,
        followers_count: parseNumber(row[1]),
        posts_count: parseNumber(row[2]),
        reach: parseNumber(row[3]),
        engagement: parseNumber(row[4]),
        profile_views: parseNumber(row[5]),
        website_clicks: parseNumber(row[6]),
      } as InsightRow;
    })
    .filter((row): row is InsightRow => row !== null)
    .forEach((row) => {
      uniqueMap.set(row.id, row);
    });

  return Array.from(uniqueMap.values());
}

function buildReelRows(rows: SheetRow[], userId: string): ReelRow[] {
  const uniqueMap = new Map<string, ReelRow>();

  rows
    .filter((row): row is string[] => Array.isArray(row) && Boolean(row[0]))
    .map((row) => {
      const instagramId = row[0] ?? '';
      return {
        id: `${userId}_${instagramId}`,
        user_id: userId,
        instagram_id: instagramId,
        caption: row[1] ?? '',
        media_product_type: row[2] ?? '',
        media_type: row[3] ?? '',
        permalink: row[4] ?? '',
        timestamp_iso: toIsoFromJst(row[5]) || '',
        views: parseNumber(row[6]),
        reach: parseNumber(row[7]),
        total_interactions: parseNumber(row[8]),
        like_count: parseNumber(row[9]),
        comments_count: parseNumber(row[10]),
        saved: parseNumber(row[11]),
        shares: parseNumber(row[12]),
        video_view_total_time_hours: row[13]?.trim() ? row[13].trim() : '',
        avg_watch_time_seconds: parseOptionalNumber(row[14]) ?? 0,
        drive_image_url: row[15]?.trim() || '',
        thumbnail_url: row[16]?.trim() || '',
      };
    })
    .forEach((row) => {
      uniqueMap.set(row.id, row);
    });

  return Array.from(uniqueMap.values());
}

function buildStoryRows(rows: SheetRow[], userId: string): StoryRow[] {
  const uniqueMap = new Map<string, StoryRow>();

  rows
    .filter((row): row is string[] => Array.isArray(row) && Boolean(row[0]))
    .map((row) => {
      const instagramId = row[0] ?? '';
      return {
        id: `${userId}_${instagramId}`,
        user_id: userId,
        instagram_id: instagramId,
        drive_image_url: row[1]?.trim() || '',
        thumbnail_url: row[2]?.trim() || '',
        timestamp_iso: toIsoFromJst(row[3]) || '',
        views: parseNumber(row[4]),
        reach: parseNumber(row[5]),
        replies: parseNumber(row[6]),
        caption: row[7]?.trim() || '',
        total_interactions: parseNumber(row[8]),
        follows: parseNumber(row[9]),
        profile_visits: parseNumber(row[10]),
        navigation: parseNumber(row[11]),
      };
    })
    .forEach((row) => {
      uniqueMap.set(row.id, row);
    });

  return Array.from(uniqueMap.values());
}

async function upsertInstagramInsights(
  bigquery: BigQuery,
  rows: InsightRow[],
  projectId: string,
  dataset: string,
  location: string,
) {
  if (!rows.length) {
    console.log('[sync-insights] No Instagram insight rows to sync.');
    return;
  }

  console.log(`[sync-insights] Upserting ${rows.length} Instagram insight rows...`);

  const query = `
    MERGE \`${projectId}.${dataset}.instagram_insights\` T
    USING UNNEST(@rows) S
    ON T.user_id = S.user_id AND T.date = PARSE_DATE('%Y-%m-%d', S.date)
    WHEN MATCHED THEN UPDATE SET
      followers_count = S.followers_count,
      posts_count = S.posts_count,
      reach = S.reach,
      engagement = S.engagement,
      profile_views = S.profile_views,
      website_clicks = S.website_clicks
    WHEN NOT MATCHED THEN
      INSERT (id, user_id, date, followers_count, posts_count, reach, engagement, profile_views, website_clicks, created_at)
      VALUES (
        S.id,
        S.user_id,
        PARSE_DATE('%Y-%m-%d', S.date),
        S.followers_count,
        S.posts_count,
        S.reach,
        S.engagement,
        S.profile_views,
        S.website_clicks,
        CURRENT_TIMESTAMP()
      )
  `;

  await bigquery.query({ query, params: { rows }, location });
}

async function upsertInstagramReels(
  bigquery: BigQuery,
  rows: ReelRow[],
  projectId: string,
  dataset: string,
  location: string,
) {
  if (!rows.length) {
    console.log('[sync-insights] No reel rows to sync.');
    return;
  }

  console.log(`[sync-insights] Upserting ${rows.length} reel rows...`);

  const query = `
    MERGE \`${projectId}.${dataset}.instagram_reels\` T
    USING UNNEST(@rows) S
    ON T.user_id = S.user_id AND T.instagram_id = S.instagram_id
    WHEN MATCHED THEN UPDATE SET
      caption = S.caption,
      media_product_type = S.media_product_type,
      media_type = S.media_type,
      permalink = S.permalink,
      timestamp = COALESCE(SAFE.TIMESTAMP(NULLIF(S.timestamp_iso, '')), T.timestamp),
      views = S.views,
      reach = S.reach,
      total_interactions = S.total_interactions,
      like_count = S.like_count,
      comments_count = S.comments_count,
      saved = S.saved,
      shares = S.shares,
      video_view_total_time_hours = NULLIF(S.video_view_total_time_hours, ''),
      avg_watch_time_seconds = NULLIF(S.avg_watch_time_seconds, 0),
      drive_image_url = NULLIF(S.drive_image_url, ''),
      thumbnail_url = NULLIF(S.thumbnail_url, ''),
      updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (
        id,
        user_id,
        instagram_id,
        caption,
        media_product_type,
        media_type,
        permalink,
        timestamp,
        views,
        reach,
        total_interactions,
        like_count,
        comments_count,
        saved,
        shares,
        video_view_total_time_hours,
        avg_watch_time_seconds,
        drive_image_url,
        thumbnail_url,
        created_at,
        updated_at
      )
      VALUES (
        S.id,
        S.user_id,
        S.instagram_id,
        S.caption,
        S.media_product_type,
        S.media_type,
        S.permalink,
        SAFE.TIMESTAMP(NULLIF(S.timestamp_iso, '')),
        S.views,
        S.reach,
        S.total_interactions,
        S.like_count,
        S.comments_count,
        S.saved,
        S.shares,
        NULLIF(S.video_view_total_time_hours, ''),
        NULLIF(S.avg_watch_time_seconds, 0),
        NULLIF(S.drive_image_url, ''),
        NULLIF(S.thumbnail_url, ''),
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
  `;

  await bigquery.query({ query, params: { rows }, location });
}

async function upsertInstagramStories(
  bigquery: BigQuery,
  rows: StoryRow[],
  projectId: string,
  dataset: string,
  location: string,
) {
  if (!rows.length) {
    console.log('[sync-insights] No story rows to sync.');
    return;
  }

  console.log(`[sync-insights] Upserting ${rows.length} story rows...`);

  const query = `
    MERGE \`${projectId}.${dataset}.instagram_stories\` T
    USING UNNEST(@rows) S
    ON T.user_id = S.user_id AND T.instagram_id = S.instagram_id
    WHEN MATCHED THEN UPDATE SET
      drive_image_url = NULLIF(S.drive_image_url, ''),
      thumbnail_url = NULLIF(S.thumbnail_url, ''),
      timestamp = COALESCE(SAFE.TIMESTAMP(NULLIF(S.timestamp_iso, '')), T.timestamp),
      views = S.views,
      reach = S.reach,
      replies = S.replies,
      caption = NULLIF(S.caption, ''),
      total_interactions = S.total_interactions,
      follows = S.follows,
      profile_visits = S.profile_visits,
      navigation = S.navigation,
      updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (
        id,
        user_id,
        instagram_id,
        drive_image_url,
        thumbnail_url,
        timestamp,
        views,
        reach,
        replies,
        caption,
        total_interactions,
        follows,
        profile_visits,
        navigation,
        created_at,
        updated_at
      )
      VALUES (
        S.id,
        S.user_id,
        S.instagram_id,
        NULLIF(S.drive_image_url, ''),
        NULLIF(S.thumbnail_url, ''),
        SAFE.TIMESTAMP(NULLIF(S.timestamp_iso, '')),
        S.views,
        S.reach,
        S.replies,
        NULLIF(S.caption, ''),
        S.total_interactions,
        S.follows,
        S.profile_visits,
        S.navigation,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
  `;

  await bigquery.query({ query, params: { rows }, location });
}

async function main() {
  const config = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);

  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('[sync-insights] Fetching spreadsheet data...');
  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: ['Instagram insight!A2:Z', 'reel rawdata!A2:Q', 'stories rawdata!A2:L'],
  });

  const [
    insightRange = { values: [] },
    reelRange = { values: [] },
    storyRange = { values: [] },
  ] = batch.data.valueRanges ?? [];

  const insightRows = insightRange.values ?? [];
  const reelRows = reelRange.values ?? [];
  const storyRows = storyRange.values ?? [];

  console.log('[sync-insights] Rows fetched:', {
    insights: insightRows.length,
    reels: reelRows.length,
    stories: storyRows.length,
  });

  const insightPayload = buildInsightRows(insightRows, config.defaultUserId);
  const reelPayload = buildReelRows(reelRows, config.defaultUserId);
  const storyPayload = buildStoryRows(storyRows, config.defaultUserId);

  const projectId = config.projectId;
  const dataset = config.dataset;

  await upsertInstagramInsights(bigquery, insightPayload, projectId, dataset, LOCATION);
  await upsertInstagramReels(bigquery, reelPayload, projectId, dataset, LOCATION);
  await upsertInstagramStories(bigquery, storyPayload, projectId, dataset, LOCATION);

  console.log('[sync-insights] Sync completed successfully.');
}

main().catch((error) => {
  console.error('[sync-insights] Failed:', error);
  process.exitCode = 1;
});
