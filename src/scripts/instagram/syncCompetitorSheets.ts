import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { google } from 'googleapis';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const SPREADSHEET_ID = process.env.IG_COMPETITOR_SPREADSHEET_ID ?? '13AI2CmEgPdqmBE3XAzSz1RZc4kODx_v9G-uwNRrpaKU';
const POST_SHEET = '投稿データ';
const ACCOUNT_SHEET = 'アカウントデータ';

interface PostRow {
  instagram_media_id: string;
  caption: string;
  username: string;
  account_url: string;
  product_type: string;
  media_type: string;
  permalink: string;
  timestamp: string;
  like_count: number | null;
  comments_count: number | null;
  drive_file_url: string;
}

interface AccountHistoryRow {
  date: string;
  username: string;
  account_url: string;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJsonField(raw: unknown): string {
  if (typeof raw !== 'string') return String(raw ?? '');
  // GAS では JSON.stringify(post.id) で書かれている = `"18063..."` のような形
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.replace(/^"|"$/g, '');
    }
  }
  return trimmed;
}

function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchPostRows(): Promise<PostRow[]> {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${POST_SHEET}!A2:K`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row && row.length > 0 && row[0])
    .map((row): PostRow => ({
      instagram_media_id: parseJsonField(row[0]),
      caption: String(row[1] ?? ''),
      username: String(row[2] ?? ''),
      account_url: String(row[3] ?? ''),
      product_type: String(row[4] ?? ''),
      media_type: String(row[5] ?? ''),
      permalink: String(row[6] ?? ''),
      timestamp: normalizeTimestamp(row[7]) ?? '',
      like_count: toNumber(row[8]),
      comments_count: toNumber(row[9]),
      drive_file_url: String(row[10] ?? ''),
    }))
    .filter((post) => post.username && post.timestamp);
}

async function fetchAccountHistoryRows(): Promise<AccountHistoryRow[]> {
  const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNT_SHEET}!A2:F`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row && row.length > 0 && row[0])
    .map((row): AccountHistoryRow => ({
      date: normalizeDate(row[0]) ?? '',
      username: String(row[1] ?? ''),
      account_url: String(row[2] ?? ''),
      followers_count: toNumber(row[3]),
      follows_count: toNumber(row[4]),
      media_count: toNumber(row[5]),
    }))
    .filter((acc) => acc.date && acc.username);
}

async function upsertCompetitorReels(bigquery: ReturnType<typeof createInstagramBigQuery>, projectId: string, dataset: string, posts: PostRow[]): Promise<void> {
  if (!posts.length) return;
  // streaming buffer 制約のため DELETE は使えない。今日付の既存IDをBQから取得し、差分のみINSERT
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await bigquery.query({
    query: `SELECT DISTINCT instagram_media_id FROM \`${projectId}.${dataset}.competitor_reels_raw\` WHERE snapshot_date = '${today}'`,
  });
  const existingIds = new Set((existing as Array<{ instagram_media_id: string }>).map((r) => r.instagram_media_id));
  const newPosts = posts.filter((p) => !existingIds.has(p.instagram_media_id));
  console.log(`[sync-competitor-sheets] ${newPosts.length} new posts to insert (${posts.length - newPosts.length} already in today's snapshot)`);
  if (!newPosts.length) return;

  const rows = newPosts.map((post) => ({
    snapshot_date: today,
    username: post.username,
    instagram_media_id: post.instagram_media_id,
    drive_file_id: post.drive_file_url.match(/\/file\/d\/([^/]+)/)?.[1] ?? null,
    drive_file_url: post.drive_file_url || null,
    caption: post.caption,
    permalink: post.permalink || null,
    media_type: post.media_type || null,
    posted_at: post.timestamp,
    created_at: new Date().toISOString(),
    sheet_caption: post.caption,
    view_count: null,
    like_count: post.like_count,
    comments_count: post.comments_count,
  }));

  // chunked insert
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await bigquery.dataset(dataset).table('competitor_reels_raw').insert(rows.slice(i, i + chunkSize));
  }
}

async function upsertAccountHistory(bigquery: ReturnType<typeof createInstagramBigQuery>, projectId: string, dataset: string, accounts: AccountHistoryRow[]): Promise<void> {
  if (!accounts.length) return;

  // streaming buffer 制約のため DELETE 不可。(date, username) ごとに既存のものをスキップ
  const [existing] = await bigquery.query({
    query: `SELECT CONCAT(CAST(date AS STRING), '|', username) AS key FROM \`${projectId}.${dataset}.instagram_competitor_account_history\``,
  });
  const existingKeys = new Set((existing as Array<{ key: string }>).map((r) => r.key));
  const newRows = accounts.filter((a) => !existingKeys.has(`${a.date}|${a.username}`));
  console.log(`[sync-competitor-sheets] ${newRows.length} new account history rows to insert (${accounts.length - newRows.length} already exist)`);
  if (!newRows.length) return;

  const rows = newRows.map((acc) => ({
    date: acc.date,
    username: acc.username,
    account_url: acc.account_url || null,
    followers_count: acc.followers_count,
    follows_count: acc.follows_count,
    media_count: acc.media_count,
    created_at: new Date().toISOString(),
  }));

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await bigquery.dataset(dataset).table('instagram_competitor_account_history').insert(rows.slice(i, i + chunkSize));
  }
}

async function main() {
  console.log('[sync-competitor-sheets] Loading sheets...');
  const [posts, accountHistory] = await Promise.all([
    fetchPostRows(),
    fetchAccountHistoryRows(),
  ]);
  console.log(`[sync-competitor-sheets] Loaded ${posts.length} posts, ${accountHistory.length} account history rows.`);

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const { projectId, dataset } = getInstagramStorageConfig();

  console.log('[sync-competitor-sheets] Upserting posts...');
  await upsertCompetitorReels(bigquery, projectId, dataset, posts);

  console.log('[sync-competitor-sheets] Upserting account history...');
  await upsertAccountHistory(bigquery, projectId, dataset, accountHistory);

  console.log('[sync-competitor-sheets] Done.');
}

main().catch((error) => {
  console.error('[sync-competitor-sheets] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('Insert errors detail:', JSON.stringify((error as { errors: unknown }).errors, null, 2).slice(0, 1500));
  }
  process.exitCode = 1;
});
