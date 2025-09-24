import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from './bigquery';
import type {
  PromptAccountSummary,
  PromptSelfPost,
  PromptCompetitorHighlight,
  PromptTrendingTopic,
  PromptTemplateSummary,
  ThreadsPromptPayload,
} from '../types/prompt';

interface BuildPromptOptions {
  projectId: string;
  referenceDate?: string;
}

const DATASET = 'autostudio_threads';

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

async function fetchAccountSummary(client: BigQuery, projectId: string): Promise<PromptAccountSummary> {
  const sql = `
    WITH recent AS (
      SELECT date, followers_snapshot, profile_views
      FROM \`${projectId}.${DATASET}.threads_daily_metrics\`
      ORDER BY date DESC
      LIMIT 7
    ),
    stats AS (
      SELECT
        AVG(followers_snapshot) AS avg_followers,
        AVG(profile_views) AS avg_profile_views,
        MAX(IF(date = (SELECT MAX(date) FROM recent), followers_snapshot, NULL)) AS latest_followers,
        MAX(IF(date = (SELECT MIN(date) FROM recent), followers_snapshot, NULL)) AS earliest_followers,
        MAX(IF(date = (SELECT MAX(date) FROM recent), profile_views, NULL)) AS latest_views,
        MAX(IF(date = (SELECT MIN(date) FROM recent), profile_views, NULL)) AS earliest_views
      FROM recent
    )
    SELECT
      avg_followers,
      avg_profile_views,
      latest_followers - earliest_followers AS followers_change,
      latest_views - earliest_views AS profile_views_change,
      ARRAY(SELECT date FROM recent ORDER BY date) AS dates
    FROM stats
  `;

  type Row = {
    avg_followers: number | null;
    avg_profile_views: number | null;
    followers_change: number | null;
    profile_views_change: number | null;
    dates: string[];
  };
  const rows = await runQuery<Row>(client, sql);
  if (!rows.length) {
    return {
      averageFollowers: 0,
      averageProfileViews: 0,
      followersChange: 0,
      profileViewsChange: 0,
      recentDates: [],
    };
  }

  const row = rows[0];
  return {
    averageFollowers: Math.round(row.avg_followers ?? 0),
    averageProfileViews: Math.round(row.avg_profile_views ?? 0),
    followersChange: Math.round(row.followers_change ?? 0),
    profileViewsChange: Math.round(row.profile_views_change ?? 0),
    recentDates: (row.dates ?? []).map((d: unknown) => toPlainString(d) ?? '').filter(Boolean),
  };
}

async function fetchTopSelfPosts(client: BigQuery, projectId: string): Promise<PromptSelfPost[]> {
  const sql = `
    SELECT post_id, posted_at, content, impressions_total, likes_total, permalink
    FROM \`${projectId}.${DATASET}.threads_posts\`
    WHERE posted_at IS NOT NULL
    ORDER BY impressions_total DESC
    LIMIT 10
  `;
  type Row = {
    post_id?: string;
    posted_at?: string;
    content?: string;
    impressions_total?: number;
    likes_total?: number;
    permalink?: string;
  };
  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    postId: row.post_id ?? '',
    postedAt: toPlainString(row.posted_at) ?? null,
    impressions: Number(row.impressions_total ?? 0),
    likes: Number(row.likes_total ?? 0),
    content: row.content ?? '',
    permalink: row.permalink ?? '',
  }));
}

async function fetchCompetitorHighlights(client: BigQuery, projectId: string): Promise<PromptCompetitorHighlight[]> {
  const sql = `
    SELECT account_name, username, post_date, content, impressions, likes
    FROM \`${projectId}.${DATASET}.competitor_posts_raw\`
    WHERE post_date IS NOT NULL
    ORDER BY impressions DESC NULLS LAST
    LIMIT 5
  `;
  type Row = {
    account_name?: string;
    username?: string;
    post_date?: string;
    content?: string;
    impressions?: number | null;
    likes?: number | null;
  };
  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    accountName: row.account_name ?? 'unknown',
    username: row.username ?? null,
    impressions: row.impressions ?? null,
    likes: row.likes ?? null,
    postDate: toPlainString(row.post_date) ?? null,
    contentSnippet: (row.content ?? '').slice(0, 280),
  }));
}

async function fetchTrendingTopics(client: BigQuery, projectId: string): Promise<PromptTrendingTopic[]> {
  const sql = `
    WITH recent AS (
      SELECT *
      FROM \`${projectId}.${DATASET}.competitor_account_daily\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    ),
    enriched AS (
      SELECT account_name, COALESCE(username, account_name) AS uname, COALESCE(genre, 'その他') AS genre,
             date, followers_delta, views
      FROM recent
    ),
    grouped AS (
      SELECT
        genre AS theme_tag,
        AVG(followers_delta) AS avg_followers_delta,
        AVG(views) AS avg_views,
        ARRAY_AGG(DISTINCT uname LIMIT 5) AS accounts
      FROM enriched
      GROUP BY genre
    ),
    positives AS (
      SELECT * FROM grouped WHERE avg_followers_delta >= 0 ORDER BY avg_followers_delta DESC LIMIT 3
    ),
    negatives AS (
      SELECT * FROM grouped WHERE avg_followers_delta < 0 ORDER BY avg_followers_delta ASC LIMIT 3
    )
    SELECT * FROM positives
    UNION ALL
    SELECT * FROM negatives
  `;
  type Row = {
    theme_tag?: string;
    avg_followers_delta?: number;
    avg_views?: number;
    accounts?: string[];
  };
  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    themeTag: row.theme_tag ?? 'その他',
    avgFollowersDelta: Number(row.avg_followers_delta ?? 0),
    avgViews: Number(row.avg_views ?? 0),
    sampleAccounts: row.accounts ?? [],
  }));
}

async function fetchTemplateSummaries(client: BigQuery, projectId: string): Promise<PromptTemplateSummary[]> {
  const sql = `
    SELECT
      t.template_id,
      t.version,
      t.status,
      t.structure_notes,
      s.impression_avg72h,
      s.like_avg72h
    FROM \`${projectId}.${DATASET}.threads_prompt_templates\` AS t
    LEFT JOIN \`${projectId}.${DATASET}.threads_prompt_template_scores\` AS s
      ON t.template_id = s.template_id
    ORDER BY t.status, t.template_id, t.version DESC
  `;
  type Row = {
    template_id?: string;
    version?: number;
    status?: string;
    structure_notes?: string;
    impression_avg72h?: number;
    like_avg72h?: number;
  };
  const rows = await runQuery<Row>(client, sql);
  const seen = new Set<string>();
  const summaries: PromptTemplateSummary[] = [];
  for (const row of rows) {
    const id = row.template_id ?? 'unknown';
    if (seen.has(id)) continue;
    seen.add(id);
    summaries.push({
      templateId: id,
      version: Number(row.version ?? 1),
      status: row.status ?? 'active',
      impressionAvg72h: row.impression_avg72h ?? undefined,
      likeAvg72h: row.like_avg72h ?? undefined,
      structureNotes: row.structure_notes ?? undefined,
    });
  }
  return summaries.slice(0, 10);
}

export function buildScheduleSlots(count: number, startHour = 7, intervalMinutes = 90): string[] {
  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const minutes = startHour * 60 + i * intervalMinutes;
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }
  return slots;
}

export async function buildThreadsPromptPayload(options: BuildPromptOptions): Promise<ThreadsPromptPayload> {
  const client = createBigQueryClient(options.projectId);

  const [accountSummary, topSelfPosts, competitorHighlights, trendingTopics, templateSummaries] =
    await Promise.all([
      fetchAccountSummary(client, options.projectId),
      fetchTopSelfPosts(client, options.projectId),
      fetchCompetitorHighlights(client, options.projectId),
      fetchTrendingTopics(client, options.projectId),
      fetchTemplateSummaries(client, options.projectId),
    ]);

  const targetCount = 10;
  const generationId = options.referenceDate ?? new Date().toISOString().slice(0, 10);

  return {
    meta: {
      generationId,
      targetPostCount: targetCount,
      recommendedSchedule: buildScheduleSlots(targetCount),
    },
    accountSummary,
    topSelfPosts,
    competitorHighlights,
    trendingTopics,
    templateSummaries,
  };
}
