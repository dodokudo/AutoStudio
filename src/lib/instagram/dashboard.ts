import { createBigQueryClient } from '@/lib/bigquery';
import { loadInstagramConfig } from './config';
import { listUserCompetitors, type CompetitorProfile } from './competitors';
import type { BigQuery } from '@google-cloud/bigquery';

const DEFAULT_DATASET = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
const ANALYCA_DATASET = 'analyca';

export interface FollowerPoint {
  date: string;
  followers: number;
  reach: number;
  engagement: number;
}

export interface CompetitorHighlight {
  username: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  caption: string | null;
  permalink: string | null;
}

export interface TranscriptInsight {
  summary: string;
  hooks: string[];
  ctaIdeas: string[];
}

export interface ReelScriptSummary {
  title: string;
  hook: string;
  body: string;
  cta: string;
  storyText: string;
  inspirationSources: string[];
}

export interface InstagramDashboardData {
  followerSeries: FollowerPoint[];
  latestFollower?: FollowerPoint;
  competitorHighlights: CompetitorHighlight[];
  transcriptInsights: TranscriptInsight[];
  scripts: ReelScriptSummary[];
  userCompetitors: CompetitorProfile[];
}

export async function getInstagramDashboardData(projectId: string): Promise<InstagramDashboardData> {
  const client = createBigQueryClient(projectId, process.env.IG_GCP_LOCATION ?? 'asia-northeast1');
  const config = loadInstagramConfig();

  const [followerSeries, competitorHighlights, transcriptInsights, scripts, userCompetitors] = await Promise.all([
    fetchFollowerSeries(client, projectId),
    fetchCompetitorHighlights(client, projectId),
    fetchTranscriptInsights(client, projectId),
    fetchLatestScripts(client, projectId),
    listUserCompetitors(config.defaultUserId, client).catch(() => [] as CompetitorProfile[]),
  ]);

  return {
    followerSeries,
    latestFollower: followerSeries[0],
    competitorHighlights,
    transcriptInsights,
    scripts,
    userCompetitors,
  };
}

async function fetchFollowerSeries(client: BigQuery, projectId: string): Promise<FollowerPoint[]> {
  const query = `
    SELECT
      DATE(date) AS date,
      SAFE_CAST(followers_count AS INT64) AS followers,
      SAFE_CAST(reach AS INT64) AS reach,
      SAFE_CAST(engagement AS INT64) AS engagement
    FROM \
\`${projectId}.${ANALYCA_DATASET}.instagram_insights\`
    WHERE date IS NOT NULL
    ORDER BY date DESC
    LIMIT 30
  `;

  try {
    const [rows] = await client.query(query);
    return rows.map((row) => ({
      date: row.date as string,
      followers: Number(row.followers ?? 0),
      reach: Number(row.reach ?? 0),
      engagement: Number(row.engagement ?? 0),
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load follower series', error);
    return [];
  }
}

async function fetchCompetitorHighlights(client: BigQuery, projectId: string): Promise<CompetitorHighlight[]> {
  const dataset = DEFAULT_DATASET;
  const query = `
    SELECT
      raw.username,
      raw.caption,
      raw.permalink,
      insights.views,
      insights.likes,
      insights.comments
    FROM \
\`${projectId}.${dataset}.competitor_reels_raw\` AS raw
    LEFT JOIN \
\`${projectId}.${dataset}.competitor_reels_insights\` AS insights
      ON raw.instagram_media_id = insights.instagram_media_id
    WHERE raw.snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    ORDER BY COALESCE(insights.views, 0) DESC
    LIMIT 10
  `;

  try {
    const [rows] = await client.query(query);
    return rows.map((row) => ({
      username: row.username as string,
      caption: (row.caption as string) ?? null,
      permalink: (row.permalink as string) ?? null,
      views: row.views !== undefined ? Number(row.views) : null,
      likes: row.likes !== undefined ? Number(row.likes) : null,
      comments: row.comments !== undefined ? Number(row.comments) : null,
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load competitor highlights', error);
    return [];
  }
}

async function fetchTranscriptInsights(client: BigQuery, projectId: string): Promise<TranscriptInsight[]> {
  const dataset = DEFAULT_DATASET;
  const query = `
    SELECT
      summary,
      hooks,
      cta_ideas
    FROM \
\`${projectId}.${dataset}.competitor_reels_transcripts\`
    WHERE snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    ORDER BY snapshot_date DESC
    LIMIT 12
  `;

  try {
    const [rows] = await client.query(query);
    return rows.map((row) => ({
      summary: (row.summary as string) ?? '',
      hooks: Array.isArray(row.hooks) ? (row.hooks as string[]).filter(Boolean) : [],
      ctaIdeas: Array.isArray(row.cta_ideas) ? (row.cta_ideas as string[]).filter(Boolean) : [],
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load transcript insights', error);
    return [];
  }
}

async function fetchLatestScripts(client: BigQuery, projectId: string): Promise<ReelScriptSummary[]> {
  const dataset = DEFAULT_DATASET;
  const query = `
    SELECT
      title,
      hook,
      body,
      cta,
      story_text,
      inspiration_sources
    FROM \
\`${projectId}.${dataset}.my_reels_scripts\`
    WHERE snapshot_date = (
      SELECT MAX(snapshot_date)
      FROM \
\`${projectId}.${dataset}.my_reels_scripts\`
    )
    ORDER BY created_at DESC
    LIMIT 5
  `;

  try {
    const [rows] = await client.query(query);
    return rows.map((row) => ({
      title: (row.title as string) ?? 'Untitled',
      hook: (row.hook as string) ?? '',
      body: (row.body as string) ?? '',
      cta: (row.cta as string) ?? '',
      storyText: (row.story_text as string) ?? '',
      inspirationSources: Array.isArray(row.inspiration_sources)
        ? (row.inspiration_sources as string[]).filter(Boolean)
        : [],
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load scripts', error);
    return [];
  }
}
