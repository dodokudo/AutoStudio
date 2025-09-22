import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { SheetsClient } from '../lib/googleSheets';
import { createBigQueryClient, getDataset } from '../lib/bigquery';
import { BigQuery } from '@google-cloud/bigquery';

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
  const iso = parseDate(value);
  if (!iso) return null;
  return iso.slice(0, 10);
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
  const width = values[0]?.length ?? 0;

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
    const accountName = row[accountIdx];
    if (!accountName) continue;
    const meta = accountMeta.get(accountName.trim());
    rows.push({
      source_sheet: COMPETITOR_ALL_POSTS_SHEET,
      account_name: accountName,
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

  const [threadsMetricsValues, threadsPostsValues, competitorTargetsValues, competitorAllPostsValues] =
    await Promise.all([
      sheetsThreads.getSheetValues(range(THREADS_SHEET_NAME, 'A1:Z1000')),
      sheetsThreads.getSheetValues(range(THREADS_POST_SHEET_NAME, 'A1:Z2000')),
      sheetsCompetitor.getSheetValues(range(COMPETITOR_TARGETS_SHEET, 'A1:ZZ2000')),
      sheetsCompetitor.getSheetValues(range(COMPETITOR_ALL_POSTS_SHEET, 'A1:Z2000')),
    ]);

  const threadsMetrics = parseThreadsDailyMetrics(threadsMetricsValues);
  const threadsPosts = parseThreadsPosts(threadsPostsValues);
  const competitorAccountMap = buildCompetitorAccountMap(competitorTargetsValues);
  const competitorPosts = parseCompetitorPosts(competitorAllPostsValues, competitorAccountMap);

  const bigQueryClient = createBigQueryClient(PROJECT_ID);

  await loadIntoBigQuery(bigQueryClient, 'threads_daily_metrics', threadsMetrics);
  await loadIntoBigQuery(bigQueryClient, 'threads_posts', threadsPosts);
  await loadIntoBigQuery(bigQueryClient, 'competitor_posts_raw', competitorPosts);

  console.log('Sync completed successfully.');
}

main().catch((error) => {
  console.error('Sync failed:', error);
  process.exitCode = 1;
});
