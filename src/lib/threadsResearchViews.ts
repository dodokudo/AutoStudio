/**
 * Per-post view counts for watched competitor accounts.
 *
 * The Threads API only returns a rolling seven-day total for other people's
 * profiles, so view counts are read from the public post page ("表示2.8万回"),
 * which is visible without logging in. One snapshot per post per day.
 */

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const projectId = resolveProjectId();
const bigquery = createBigQueryClient(projectId);
const DATASET = 'autostudio_threads';
const T_POST_VIEWS = `\`${projectId}.${DATASET}.research_post_views\``;
const T_POSTS = `\`${projectId}.${DATASET}.research_posts\``;

let ensurePromise: Promise<void> | null = null;

export async function ensurePostViewsTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = bigquery
      .query({
        query: `CREATE TABLE IF NOT EXISTS ${T_POST_VIEWS} (
          user_id STRING NOT NULL,
          username STRING NOT NULL,
          post_id STRING NOT NULL,
          permalink STRING,
          posted_at TIMESTAMP,
          snapshot_date DATE NOT NULL,
          views_count INT64,
          views_text STRING,
          collected_at TIMESTAMP
        )
        PARTITION BY snapshot_date`,
      })
      .then(() => undefined);
  }
  await ensurePromise;
}

/** "表示2.8万回" → 28000, "表示547回" → 547, "1.2K views" → 1200. Null when unparseable. */
export function parseViewsText(text: string): number | null {
  const compact = text.replace(/[,\s]/g, '');
  const ja = compact.match(/([\d.]+)(万|億)?回/);
  if (ja) {
    const base = Number(ja[1]);
    if (!Number.isFinite(base)) return null;
    const unit = ja[2] === '億' ? 1e8 : ja[2] === '万' ? 1e4 : 1;
    return Math.round(base * unit);
  }
  const en = compact.match(/([\d.]+)([KMB])?views?/i);
  if (en) {
    const base = Number(en[1]);
    if (!Number.isFinite(base)) return null;
    const unit = { K: 1e3, M: 1e6, B: 1e9 }[(en[2] ?? '').toUpperCase()] ?? 1;
    return Math.round(base * unit);
  }
  return null;
}

export interface ViewTarget {
  username: string;
  postId: string;
  permalink: string;
  postedAt: string;
}

/** Root posts from the last `days` days that have a permalink to open. */
export async function listViewTargets(userId: string, days = 14): Promise<ViewTarget[]> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const [rows] = await bigquery.query({
    query: `
      SELECT username, post_id, permalink, posted_at
      FROM ${T_POSTS}
      WHERE user_id = @userId
        AND NOT IFNULL(is_quote_post, FALSE)
        AND IFNULL(media_type, '') != 'REPOST_FACADE'
        AND permalink IS NOT NULL AND permalink != ''
        AND posted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${safeDays} DAY)
      ORDER BY username, posted_at
    `,
    params: { userId },
  });
  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    postId: String(row.post_id),
    permalink: String(row.permalink),
    postedAt: toIso(row.posted_at) ?? '',
  }));
}

export interface PostViewSnapshot extends ViewTarget {
  snapshotDate: string;
  viewsCount: number | null;
  viewsText: string | null;
}

/** Replace today's rows for the given posts, then insert. Two steps on purpose (MERGE is unreliable here). */
export async function savePostViewSnapshots(
  userId: string,
  snapshotDate: string,
  rows: PostViewSnapshot[]
): Promise<void> {
  if (rows.length === 0) return;
  await ensurePostViewsTable();
  const postIds = rows.map((row) => row.postId);
  await bigquery.query({
    query: `DELETE FROM ${T_POST_VIEWS}
      WHERE user_id = @userId AND snapshot_date = DATE(@snapshotDate) AND post_id IN UNNEST(@postIds)`,
    params: { userId, snapshotDate, postIds },
    types: { userId: 'STRING', snapshotDate: 'STRING', postIds: ['STRING'] },
  });
  const BATCH = 200;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const values = batch
      .map(
        (_row, index) =>
          `(@userId, @u${index}, @p${index}, @l${index}, TIMESTAMP(@t${index}), DATE(@snapshotDate), @v${index}, @x${index}, CURRENT_TIMESTAMP())`
      )
      .join(',\n');
    const params: Record<string, unknown> = { userId, snapshotDate };
    const types: Record<string, string> = { userId: 'STRING', snapshotDate: 'STRING' };
    batch.forEach((row, index) => {
      params[`u${index}`] = row.username;
      params[`p${index}`] = row.postId;
      params[`l${index}`] = row.permalink;
      params[`t${index}`] = row.postedAt;
      params[`v${index}`] = row.viewsCount;
      params[`x${index}`] = row.viewsText;
      types[`u${index}`] = 'STRING';
      types[`p${index}`] = 'STRING';
      types[`l${index}`] = 'STRING';
      types[`t${index}`] = 'STRING';
      types[`v${index}`] = 'INT64';
      types[`x${index}`] = 'STRING';
    });
    await bigquery.query({
      query: `INSERT INTO ${T_POST_VIEWS}
        (user_id, username, post_id, permalink, posted_at, snapshot_date, views_count, views_text, collected_at)
        VALUES ${values}`,
      params,
      types,
    });
  }
}

export interface PostViewPoint {
  username: string;
  postId: string;
  permalink: string;
  postedAt: string;
  /** JST day the post was published. */
  postDate: string;
  snapshotDate: string;
  viewsCount: number | null;
  /** Views gained since the previous snapshot of the same post (null on the first snapshot). */
  viewsDelta: number | null;
}

/** All snapshots in the range, with per-post day-over-day deltas. */
export async function getPostViewHistory(userId: string, days = 30): Promise<PostViewPoint[]> {
  await ensurePostViewsTable();
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const [rows] = await bigquery.query({
    query: `
      SELECT
        username, post_id, permalink, posted_at,
        CAST(DATE(posted_at, 'Asia/Tokyo') AS STRING) AS post_date,
        CAST(snapshot_date AS STRING) AS snapshot_date,
        views_count,
        views_count - LAG(views_count) OVER (PARTITION BY post_id ORDER BY snapshot_date) AS views_delta
      FROM ${T_POST_VIEWS}
      WHERE user_id = @userId
        AND snapshot_date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL ${safeDays - 1} DAY)
      QUALIFY ROW_NUMBER() OVER (PARTITION BY post_id, snapshot_date ORDER BY collected_at DESC) = 1
      ORDER BY snapshot_date, username, posted_at
    `,
    params: { userId },
  });
  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    postId: String(row.post_id),
    permalink: String(row.permalink ?? ''),
    postedAt: toIso(row.posted_at) ?? '',
    postDate: String(row.post_date),
    snapshotDate: String(row.snapshot_date),
    viewsCount: row.views_count === null ? null : Number(row.views_count),
    viewsDelta: row.views_delta === null || row.views_delta === undefined ? null : Number(row.views_delta),
  }));
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const raw =
    typeof value === 'object' && value !== null && 'value' in value
      ? (value as { value?: unknown }).value
      : value;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
