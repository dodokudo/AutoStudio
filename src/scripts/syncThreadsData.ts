import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { SheetsClient } from '../lib/googleSheets';
import { createBigQueryClient, getDataset } from '../lib/bigquery';
import { BigQuery, TableField } from '@google-cloud/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const PROJECT_ID = 'mark-454114';

const THREADS_SPREADSHEET_ID = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';
const THREADS_SHEET_NAME = 'Threads';
const THREADS_POST_SHEET_NAME = 'Threads post';

const COMPETITOR_SPREADSHEET_ID = '1AdMikjnk6OPLCi_iijeeFkRPvfRQgkIUCZy85u6_qdQ';
const COMPETITOR_TARGETS_SHEET = '対象者リスト';
const COMPETITOR_ALL_POSTS_SHEET = '全体投稿';

interface ThreadsDailyMetricRow {
  date: string;
  followers_snapshot: number;
  profile_views: number;
}

interface ThreadsPostRow {
  post_id: string;
  posted_at: string | null;
  permalink: string;
  content: string;
  impressions_total: number;
  likes_total: number;
  template_id?: string;
  updated_at?: string | null;
}

interface CompetitorPostRow {
  source_sheet: string;
  account_name: string;
  username: string | null;
  follower_count: number | null;
  post_date: string | null;
  content: string;
  impressions: number | null;
  likes: number | null;
  collected_at: string;
}

interface CompetitorAccountMeta {
  username: string | null;
  url: string | null;
  genre: string | null;
}

interface CompetitorDailyMetricRow {
  account_name: string;
  username: string | null;
  url: string | null;
  genre: string | null;
  date: string;
  followers: number;
  followers_delta: number;
  posts_count: number;
  views: number;
  collected_at: string;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/[,"\\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumberAllowNull(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[,"\\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let date: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    date = new Date(trimmed + 'T00:00:00Z');
  } else if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(trimmed)) {
    const replaced = trimmed.replace(/\//g, '-');
    date = new Date(replaced);
  } else if (/T/.test(trimmed) || /\+\d{2}/.test(trimmed)) {
    date = new Date(trimmed);
  } else {
    date = new Date(trimmed);
  }

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function parseDateOnly(value: string | undefined): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[年月]/g, '/')
    .replace(/日/g, '')
    .trim();

  if (!cleaned) return null;

  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(cleaned)) {
    const iso = parseDate(cleaned);
    return iso ? iso.slice(0, 10) : null;
  }

  if (/^\d{1,2}[/-]\d{1,2}$/.test(cleaned)) {
    const [monthStr, dayStr] = cleaned.split(/[/-]/);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!month || !day) return null;

    const now = new Date();
    let year = now.getFullYear();
    let candidate = new Date(Date.UTC(year, month - 1, day));

    if (candidate.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 180) {
      year -= 1;
      candidate = new Date(Date.UTC(year, month - 1, day));
    }

    return candidate.toISOString().slice(0, 10);
  }

  const iso = parseDate(cleaned);
  return iso ? iso.slice(0, 10) : null;
}

async function truncateTable(client: BigQuery, tableName: string) {
  const query = `TRUNCATE TABLE \`${PROJECT_ID}.autostudio_threads.${tableName}\``;
  await client.query({ query });
}

async function loadIntoBigQuery<T extends Record<string, unknown>>(
  client: BigQuery,
  tableName: string,
  rows: T[],
) {
  if (!rows.length) {
    console.log(`[skip] ${tableName}: no rows to insert`);
    return;
  }

  const dataset = getDataset(client);
  const table = dataset.table(tableName);

  await truncateTable(client, tableName);

  await table.insert(rows, { raw: false, ignoreUnknownValues: true });
  console.log(`[done] inserted ${rows.length} rows into ${tableName}`);
}

async function ensureTable(
  client: BigQuery,
  tableName: string,
  schema: TableField[],
) {
  const dataset = getDataset(client);
  const table = dataset.table(tableName);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({ schema });
    console.log(`[info] created table ${tableName}`);
  }
}

function range(sheetName: string, cells: string): string {
  const safeName = `'${sheetName.replace(/'/g, "''")}'`;
  return `${safeName}!${cells}`;
}

function parseThreadsDailyMetrics(values: string[][]): ThreadsDailyMetricRow[] {
  if (!values.length) return [];
  const header = values[0];
  const dateIdx = header.indexOf('Date');
  const followersIdx = header.indexOf('Followers (Snapshot)');
  const profileViewsIdx = header.indexOf('Profile Views');

  const rows: ThreadsDailyMetricRow[] = [];
  for (const row of values.slice(1)) {
    const date = row[dateIdx];
    if (!date) continue;
    rows.push({
      date: parseDateOnly(date) ?? '',
      followers_snapshot: parseNumber(row[followersIdx]),
      profile_views: parseNumber(row[profileViewsIdx]),
    });
  }
  return rows.filter((row) => row.date);
}

function parseThreadsPosts(values: string[][]): ThreadsPostRow[] {
  if (!values.length) return [];
  const header = values[0];
  const idIdx = header.indexOf('投稿ID');
  const postedIdx = header.indexOf('投稿日');
  const urlIdx = header.indexOf('URL');
  const contentIdx = header.indexOf('投稿内容');
  const impressionsIdx = header.indexOf('閲覧数');
  const likesIdx = header.indexOf('いいね');
  const updatedIdx = header.indexOf('更新日');

  const rows: ThreadsPostRow[] = [];
  for (const row of values.slice(1)) {
    const postId = row[idIdx];
    if (!postId) continue;
    rows.push({
      post_id: postId,
      posted_at: parseDate(row[postedIdx]),
      permalink: row[urlIdx] ?? '',
      content: row[contentIdx] ?? '',
      impressions_total: parseNumber(row[impressionsIdx]),
      likes_total: parseNumber(row[likesIdx]),
      updated_at: parseDate(row[updatedIdx]),
    });
  }
  return rows;
}

function buildCompetitorAccountMap(values: string[][]): Map<string, CompetitorAccountMeta> {
  const map = new Map<string, CompetitorAccountMeta>();
  if (!values.length) return map;
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);

  for (let col = 1; col < width; ) {
    const name = values[1]?.[col]?.trim();
    if (name) {
      const username = values[2]?.[col]?.trim() || null;
      const url = values[3]?.[col]?.trim() || null;
      const genre = values[4]?.[col]?.trim() || null;
      map.set(name, { username, url, genre });
    }

    col += 1;
    while (col < width && (!values[1]?.[col] || !values[1][col].trim())) {
      col += 1;
    }
  }

  return map;
}

function parseCompetitorDailyMetrics(
  values: string[][],
  accountMeta: Map<string, CompetitorAccountMeta>,
): CompetitorDailyMetricRow[] {
  if (!values.length) return [];
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);
  const nowIso = new Date().toISOString();
  const rows: CompetitorDailyMetricRow[] = [];

  for (let col = 1; col < width; ) {
    const name = values[1]?.[col]?.trim();
    if (!name) {
      col += 1;
      continue;
    }

    const meta = accountMeta.get(name) ?? {
      username: values[2]?.[col]?.trim() || null,
      url: values[3]?.[col]?.trim() || null,
      genre: values[4]?.[col]?.trim() || null,
    };

    const followersCol = col;
    const followersDeltaCol = col + 1;
    const postsCol = col + 2;
    const viewsCol = col + 3;

    for (let rowIdx = 7; rowIdx < values.length; rowIdx += 1) {
      const rawDate = values[rowIdx]?.[0];
      if (!rawDate) continue;
      const parsedDate = parseDateOnly(rawDate.replace(/\([^\)]*\)/g, '').trim());
      if (!parsedDate) continue;

      const followers = parseNumber(values[rowIdx]?.[followersCol]);
      const followersDelta = parseNumber(values[rowIdx]?.[followersDeltaCol]);
      const postsCount = parseNumber(values[rowIdx]?.[postsCol]);
      const views = parseNumber(values[rowIdx]?.[viewsCol]);

      if (followers === 0 && followersDelta === 0 && postsCount === 0 && views === 0) {
        continue;
      }
      rows.push({
        account_name: name,
        username: meta.username,
        url: meta.url,
        genre: meta.genre,
        date: parsedDate,
        followers,
        followers_delta: followersDelta,
        posts_count: postsCount,
        views,
        collected_at: nowIso,
      });
    }

    col += 5; // 4 data columns + 1 blank separator
  }

  return rows;
}

function parseCompetitorPosts(
  values: string[][],
  accountMeta: Map<string, CompetitorAccountMeta>,
): CompetitorPostRow[] {
  if (!values.length) return [];

  const header = values[0];
  const accountIdx = header.indexOf('投稿者');
  const dateIdx = header.indexOf('投稿日');
  const contentIdx = header.indexOf('投稿内容');
  const urlIdx = header.indexOf('URL');
  const impressionsIdx = header.indexOf('インプレッション');
  const likesIdx = header.indexOf('いいね');

  const nowIso = new Date().toISOString();

  const rows: CompetitorPostRow[] = [];
  for (const row of values.slice(1)) {
    // 投稿者列がない場合は、データがある最初の列を投稿者として使用
    const accountName = row[0] || 'Unknown';
    if (!accountName || accountName.trim() === '') continue;

    const meta = accountMeta.get(accountName.trim());
    rows.push({
      source_sheet: COMPETITOR_ALL_POSTS_SHEET,
      account_name: accountName.trim(),
      username: meta?.username ?? null,
      follower_count: null,
      post_date: parseDate(row[dateIdx]),
      content: [row[contentIdx], row[urlIdx]].filter(Boolean).join('\n'),
      impressions: parseNumberAllowNull(row[impressionsIdx]),
      likes: parseNumberAllowNull(row[likesIdx]),
      collected_at: nowIso,
    });
  }

  return rows;
}

async function main() {
  console.log('Starting Threads data sync...');
  const sheetsThreads = new SheetsClient({ spreadsheetId: THREADS_SPREADSHEET_ID });
  const sheetsCompetitor = new SheetsClient({ spreadsheetId: COMPETITOR_SPREADSHEET_ID });

  console.log('[sync] Fetching data from spreadsheets...');
  const [threadsMetricsValues, threadsPostsValues, competitorTargetsValues, competitorAllPostsValues] =
    await Promise.all([
      sheetsThreads.getSheetValues(range(THREADS_SHEET_NAME, 'A1:Z1000')),
      sheetsThreads.getSheetValues(range(THREADS_POST_SHEET_NAME, 'A1:Z3000')),
      sheetsCompetitor.getSheetValues(range(COMPETITOR_TARGETS_SHEET, 'A1:ZZ3000')),
      sheetsCompetitor.getSheetValues(range(COMPETITOR_ALL_POSTS_SHEET, 'A1:Z10000')),
    ]);

  console.log(`[sync] Fetched ${threadsMetricsValues.length} rows from Threads metrics`);
  console.log(`[sync] Fetched ${threadsPostsValues.length} rows from Threads posts`);
  console.log(`[sync] Fetched ${competitorTargetsValues.length} rows from competitor targets`);
  console.log(`[sync] Fetched ${competitorAllPostsValues.length} rows from competitor posts`);

  const threadsMetrics = parseThreadsDailyMetrics(threadsMetricsValues);
  const threadsPosts = parseThreadsPosts(threadsPostsValues);
  const competitorAccountMap = buildCompetitorAccountMap(competitorTargetsValues);
  const competitorPosts = parseCompetitorPosts(competitorAllPostsValues, competitorAccountMap);
  const competitorDailyMetrics = parseCompetitorDailyMetrics(competitorTargetsValues, competitorAccountMap);

  console.log(`[sync] Parsed ${threadsMetrics.length} threads metrics`);
  console.log(`[sync] Parsed ${threadsPosts.length} threads posts`);
  console.log(`[sync] Parsed ${competitorPosts.length} competitor posts`);
  console.log(`[sync] Parsed ${competitorDailyMetrics.length} competitor daily metrics`);

  const bigQueryClient = createBigQueryClient(PROJECT_ID);

  await ensureTable(bigQueryClient, 'competitor_posts_raw', [
    { name: 'source_sheet', type: 'STRING' },
    { name: 'account_name', type: 'STRING' },
    { name: 'username', type: 'STRING' },
    { name: 'follower_count', type: 'INT64' },
    { name: 'post_date', type: 'TIMESTAMP' },
    { name: 'content', type: 'STRING' },
    { name: 'impressions', type: 'INT64' },
    { name: 'likes', type: 'INT64' },
    { name: 'collected_at', type: 'TIMESTAMP' },
  ]);

  await ensureTable(bigQueryClient, 'competitor_account_daily', [
    { name: 'account_name', type: 'STRING' },
    { name: 'username', type: 'STRING' },
    { name: 'url', type: 'STRING' },
    { name: 'genre', type: 'STRING' },
    { name: 'date', type: 'DATE' },
    { name: 'followers', type: 'INT64' },
    { name: 'followers_delta', type: 'INT64' },
    { name: 'posts_count', type: 'INT64' },
    { name: 'views', type: 'INT64' },
    { name: 'collected_at', type: 'TIMESTAMP' },
  ]);

  await ensureTable(bigQueryClient, 'thread_post_plans', [
    { name: 'plan_id', type: 'STRING' },
    { name: 'generation_date', type: 'DATE' },
    { name: 'scheduled_time', type: 'STRING' },
    { name: 'template_id', type: 'STRING' },
    { name: 'theme', type: 'STRING' },
    { name: 'status', type: 'STRING' },
    { name: 'main_text', type: 'STRING' },
    { name: 'comments', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
  ]);

  await ensureTable(bigQueryClient, 'thread_post_jobs', [
    { name: 'job_id', type: 'STRING' },
    { name: 'plan_id', type: 'STRING' },
    { name: 'scheduled_time', type: 'TIMESTAMP' },
    { name: 'status', type: 'STRING' },
    { name: 'attempt_count', type: 'INT64' },
    { name: 'error_message', type: 'STRING' },
    { name: 'payload', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
  ]);

  await ensureTable(bigQueryClient, 'thread_posting_logs', [
    { name: 'log_id', type: 'STRING' },
    { name: 'job_id', type: 'STRING' },
    { name: 'plan_id', type: 'STRING' },
    { name: 'status', type: 'STRING' },
    { name: 'posted_thread_id', type: 'STRING' },
    { name: 'error_message', type: 'STRING' },
    { name: 'posted_at', type: 'TIMESTAMP' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ]);

  await loadIntoBigQuery(bigQueryClient, 'threads_daily_metrics', threadsMetrics as unknown as Record<string, unknown>[]);
  await loadIntoBigQuery(bigQueryClient, 'threads_posts', threadsPosts as unknown as Record<string, unknown>[]);
  await loadIntoBigQuery(bigQueryClient, 'competitor_posts_raw', competitorPosts as unknown as Record<string, unknown>[]);
  await loadIntoBigQuery(bigQueryClient, 'competitor_account_daily', competitorDailyMetrics as unknown as Record<string, unknown>[]);

  console.log('Sync completed successfully.');
}

main().catch((error) => {
  console.error('Sync failed:', error);
  process.exitCode = 1;
});
