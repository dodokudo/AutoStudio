import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import type { PromptAccountSummary, PromptTemplateSummary } from '../types/prompt';

const DATASET = 'autostudio_threads';
const CACHE_TTL_MS = 1000 * 60 * 30; // 30分キャッシュ

interface AccountSummaryCache {
  data: {
    accountSummary: PromptAccountSummary;
    templateSummaries: PromptTemplateSummary[];
    postCount: number;
  };
  fetchedAt: number;
}

const cacheStore = new Map<string, AccountSummaryCache>();

function toPlainString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return typeof inner === 'string' ? inner : null;
  }
  return String(value);
}

async function runQuery<T = Record<string, unknown>>(
  client: BigQuery,
  sql: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const [rows] = await client.query({ query: sql, params });
  return rows as T[];
}

async function fetchAccountSummary(
  client: BigQuery,
  projectId: string,
  rangeDays: number,
  startDate: string,
  endDate: string,
): Promise<PromptAccountSummary> {
  const sql = `
    WITH recent AS (
      SELECT date, followers_snapshot, profile_views
      FROM \`${projectId}.${DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN @startDate AND @endDate
      ORDER BY date DESC
      LIMIT @rangeDays
    ),
    stats AS (
      SELECT
        MAX(followers_snapshot) AS max_followers,
        SUM(profile_views) AS total_profile_views,
        AVG(profile_views) AS avg_profile_views,
        MAX(IF(date = (SELECT MAX(date) FROM recent), followers_snapshot, NULL)) AS latest_followers,
        MAX(IF(date = (SELECT MIN(date) FROM recent), followers_snapshot, NULL)) AS earliest_followers,
        MAX(IF(date = (SELECT MAX(date) FROM recent), profile_views, NULL)) AS latest_views,
        MAX(IF(date = (SELECT MIN(date) FROM recent), profile_views, NULL)) AS earliest_views
      FROM recent
    )
    SELECT
      max_followers,
      total_profile_views,
      avg_profile_views,
      latest_followers - earliest_followers AS followers_change,
      latest_views - earliest_views AS profile_views_change,
      ARRAY(SELECT date FROM recent ORDER BY date) AS dates
    FROM stats
  `;

  type Row = {
    max_followers: number | null;
    total_profile_views: number | null;
    avg_profile_views: number | null;
    followers_change: number | null;
    profile_views_change: number | null;
    dates: string[];
  };
  const rows = await runQuery<Row>(client, sql, {
    startDate,
    endDate,
    rangeDays,
  });
  if (!rows.length) {
    return {
      averageFollowers: 0,
      averageProfileViews: 0,
      totalProfileViews: 0,
      followersChange: 0,
      profileViewsChange: 0,
      recentDates: [],
    };
  }

  const row = rows[0];
  return {
    averageFollowers: Math.round(row.max_followers ?? 0),
    averageProfileViews: Math.round(row.avg_profile_views ?? 0),
    totalProfileViews: Math.round(row.total_profile_views ?? 0),
    followersChange: Math.round(row.followers_change ?? 0),
    profileViewsChange: Math.round(row.profile_views_change ?? 0),
    recentDates: (row.dates ?? []).map((d: unknown) => toPlainString(d) ?? '').filter(Boolean),
  };
}

async function fetchTemplateSummaries(client: BigQuery, projectId: string): Promise<PromptTemplateSummary[]> {
  const sql = `
    WITH all_plans AS (
      SELECT
        plan_id,
        template_id,
        TRIM(REGEXP_REPLACE(main_text, r'\\n+', ' ')) AS main_text_normalized,
        generation_date,
        scheduled_time,
        status
      FROM \`${projectId}.${DATASET}.thread_post_plans\`
      WHERE main_text IS NOT NULL
        AND LENGTH(TRIM(main_text)) > 0
    ),
    posts_with_insights AS (
      SELECT
        post_id,
        posted_at,
        content,
        TRIM(REGEXP_REPLACE(REGEXP_REPLACE(content, r'【[^】]+】', ''), r'\\n+', ' ')) AS clean_content,
        impressions_total,
        likes_total
      FROM \`${projectId}.${DATASET}.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), posted_at, HOUR) <= 48
    ),
    matched_raw AS (
      SELECT
        posts.post_id,
        posts.posted_at,
        posts.impressions_total,
        posts.likes_total,
        plans.template_id,
        ROW_NUMBER() OVER (PARTITION BY posts.post_id ORDER BY plans.generation_date DESC) as rn
      FROM posts_with_insights posts
      LEFT JOIN all_plans plans
        ON STARTS_WITH(posts.clean_content, SUBSTR(plans.main_text_normalized, 1, 40))
    ),
    matched AS (
      SELECT
        post_id,
        posted_at,
        impressions_total,
        likes_total,
        COALESCE(template_id, 'no_template') AS template_id
      FROM matched_raw
      WHERE rn = 1
    ),
    template_stats AS (
      SELECT
        template_id,
        COUNT(*) AS post_count,
        AVG(impressions_total) AS impression_avg48h,
        AVG(likes_total) AS like_avg48h,
        MAX(posted_at) AS latest_post_at
      FROM matched
      GROUP BY template_id
      HAVING COUNT(*) > 0
    )
    SELECT
      template_id,
      post_count,
      impression_avg48h,
      like_avg48h,
      CASE
        WHEN impression_avg48h >= 5000 THEN 'active'
        WHEN impression_avg48h >= 2000 THEN 'candidate'
        ELSE 'needs_review'
      END AS status,
      CASE
        WHEN template_id = 'no_template' THEN '直接投稿（テンプレート無し）'
        ELSE CONCAT(FORMAT('%d投稿', CAST(post_count AS INT64)), ' / 48時間平均パフォーマンス')
      END AS structure_notes
    FROM template_stats
    ORDER BY impression_avg48h DESC
    LIMIT 10
  `;
  type Row = {
    template_id?: string;
    post_count?: number;
    impression_avg48h?: number;
    like_avg48h?: number;
    status?: string;
    structure_notes?: string;
  };
  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    templateId: row.template_id ?? 'unknown',
    version: 1,
    status: row.status ?? 'active',
    impressionAvg72h: row.impression_avg48h ?? undefined,
    likeAvg72h: row.like_avg48h ?? undefined,
    structureNotes: row.structure_notes ?? undefined,
  }));
}

async function fetchPostCount(client: BigQuery, projectId: string, startDate: string, endDate: string): Promise<number> {
  const sql = `
    SELECT COUNT(1) AS total
    FROM \`${projectId}.${DATASET}.threads_posts\`
    WHERE posted_at IS NOT NULL
      AND DATE(posted_at) BETWEEN @startDate AND @endDate
  `;
  type Row = { total?: number };
  const rows = await runQuery<Row>(client, sql, { startDate, endDate });
  return Number(rows[0]?.total ?? 0);
}

export interface LightweightInsightsOptions {
  startDate?: string;
  endDate?: string;
  rangeDays?: number;
}

export interface LightweightInsightsData {
  accountSummary: PromptAccountSummary;
  templateSummaries: PromptTemplateSummary[];
  postCount: number;
}

/**
 * 投稿タブ用の軽量データ取得
 * accountSummary, templateSummaries, postCount のみ取得
 * 競合データや投稿生成用データは取得しない
 */
export async function getLightweightInsights(
  projectId: string,
  options: LightweightInsightsOptions = {},
): Promise<LightweightInsightsData> {
  const resolvedProjectId = resolveProjectId(projectId);

  const cacheKey = JSON.stringify({
    projectId: resolvedProjectId,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    rangeDays: options.rangeDays ?? null,
  });

  const now = Date.now();
  const cached = cacheStore.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = createBigQueryClient(resolvedProjectId);

  const rangeDays = options.rangeDays ?? 7;
  const referenceDate = new Date();

  let startDate: Date;
  let endDate: Date;

  if (options.startDate && options.endDate) {
    startDate = new Date(`${options.startDate}T00:00:00Z`);
    endDate = new Date(`${options.endDate}T00:00:00Z`);
  } else {
    endDate = referenceDate;
    startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
  }

  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  // 3つのクエリだけ並列実行（競合データ等は取得しない）
  const [accountSummary, templateSummaries, postCount] = await Promise.all([
    fetchAccountSummary(client, resolvedProjectId, rangeDays, startDateStr, endDateStr),
    fetchTemplateSummaries(client, resolvedProjectId),
    fetchPostCount(client, resolvedProjectId, startDateStr, endDateStr),
  ]);

  const result = {
    accountSummary,
    templateSummaries,
    postCount,
  };

  cacheStore.set(cacheKey, { data: result, fetchedAt: now });
  return result;
}
