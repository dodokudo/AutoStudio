import { createBigQueryClient } from '@/lib/bigquery';
import { loadInstagramConfig } from './config';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';
import type { BigQuery } from '@google-cloud/bigquery';

const DEFAULT_DATASET = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
const DEFAULT_LOCATION = process.env.IG_GCP_LOCATION ?? 'asia-northeast1';

export interface FollowerPoint {
  date: string;
  followers: number;
  reach: number;
  engagement: number;
}

export interface ReelHighlight {
  instagramId: string;
  caption: string | null;
  permalink: string | null;
  views: number | null;
  reach: number | null;
  likeCount: number | null;
  commentsCount: number | null;
  saved: number | null;
  shares: number | null;
  avgWatchTimeSeconds: number | null;
  timestamp: string | null;
}

export interface StoryHighlight {
  instagramId: string;
  caption: string | null;
  views: number | null;
  reach: number | null;
  replies: number | null;
  completionRate: number | null;
  timestamp: string | null;
  profileVisits: number | null;
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
  reels: ReelHighlight[];
  stories: StoryHighlight[];
  scripts: ReelScriptSummary[];
  lineRegistrationCount: number | null;
}

export async function getInstagramDashboardData(projectId: string): Promise<InstagramDashboardData> {
  const config = loadInstagramConfig();
  const client = createBigQueryClient(projectId, DEFAULT_LOCATION);

  const [followerSeries, reels, stories, scripts] = await Promise.all([
    fetchFollowerSeries(client, projectId, config.defaultUserId),
    fetchReelHighlights(client, projectId, config.defaultUserId),
    fetchStoryHighlights(client, projectId, config.defaultUserId),
    fetchLatestScripts(client, projectId),
  ]);

  // Fetch LINE registration count for the last 30 days
  let lineRegistrationCount: number | null = null;
  try {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    lineRegistrationCount = await countLineSourceRegistrations(projectId, {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      sourceName: 'Instagram',
    });
  } catch (lineError) {
    console.warn('[instagram/dashboard] Failed to load LINE registration count', lineError);
  }

  return {
    followerSeries,
    latestFollower: followerSeries[0],
    reels,
    stories,
    scripts,
    lineRegistrationCount,
  };
}

async function fetchFollowerSeries(client: BigQuery, projectId: string, userId: string): Promise<FollowerPoint[]> {
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(date)) AS date,
      SAFE_CAST(followers_count AS INT64) AS followers,
      SAFE_CAST(reach AS INT64) AS reach,
      SAFE_CAST(engagement AS INT64) AS engagement
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_insights\`
    WHERE user_id = @user_id
    ORDER BY date DESC
    LIMIT 30
  `;

  try {
    const [rows] = await client.query({
      query,
      params: { user_id: userId },
      location: DEFAULT_LOCATION,
    });

    return rows.map((row) => ({
      date: String(row.date),
      followers: Number(row.followers ?? 0),
      reach: Number(row.reach ?? 0),
      engagement: Number(row.engagement ?? 0),
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load follower series', error);
    return [];
  }
}

async function fetchReelHighlights(client: BigQuery, projectId: string, userId: string): Promise<ReelHighlight[]> {
  const query = `
    SELECT
      instagram_id,
      caption,
      permalink,
      views,
      reach,
      like_count,
      comments_count,
      saved,
      shares,
      avg_watch_time_seconds,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', timestamp) AS timestamp
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_reels\`
    WHERE user_id = @user_id
      AND (
        timestamp IS NULL
        OR timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 45 DAY)
      )
    ORDER BY COALESCE(views, 0) DESC, timestamp DESC
    LIMIT 12
  `;

  try {
    const [rows] = await client.query({
      query,
      params: { user_id: userId },
      location: DEFAULT_LOCATION,
    });

    return rows.map((row) => ({
      instagramId: String(row.instagram_id),
      caption: row.caption ? String(row.caption) : null,
      permalink: row.permalink ? String(row.permalink) : null,
      views: row.views !== undefined && row.views !== null ? Number(row.views) : null,
      reach: row.reach !== undefined && row.reach !== null ? Number(row.reach) : null,
      likeCount: row.like_count !== undefined && row.like_count !== null ? Number(row.like_count) : null,
      commentsCount: row.comments_count !== undefined && row.comments_count !== null ? Number(row.comments_count) : null,
      saved: row.saved !== undefined && row.saved !== null ? Number(row.saved) : null,
      shares: row.shares !== undefined && row.shares !== null ? Number(row.shares) : null,
      avgWatchTimeSeconds:
        row.avg_watch_time_seconds !== undefined && row.avg_watch_time_seconds !== null ? Number(row.avg_watch_time_seconds) : null,
      timestamp: row.timestamp ? String(row.timestamp) : null,
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load reel highlights', error);
    return [];
  }
}

async function fetchStoryHighlights(client: BigQuery, projectId: string, userId: string): Promise<StoryHighlight[]> {
  const query = `
    SELECT
      instagram_id,
      caption,
      views,
      reach,
      replies,
      profile_visits,
      SAFE_DIVIDE(views, NULLIF(reach, 0)) AS completion_rate,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', timestamp) AS timestamp
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_stories\`
    WHERE user_id = @user_id
      AND (
        timestamp IS NULL
        OR timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 45 DAY)
      )
    ORDER BY COALESCE(reach, 0) DESC, timestamp DESC
    LIMIT 12
  `;

  try {
    const [rows] = await client.query({
      query,
      params: { user_id: userId },
      location: DEFAULT_LOCATION,
    });

    return rows.map((row) => ({
      instagramId: String(row.instagram_id),
      caption: row.caption ? String(row.caption) : null,
      views: row.views !== undefined && row.views !== null ? Number(row.views) : null,
      reach: row.reach !== undefined && row.reach !== null ? Number(row.reach) : null,
      replies: row.replies !== undefined && row.replies !== null ? Number(row.replies) : null,
      completionRate:
        row.completion_rate !== undefined && row.completion_rate !== null
          ? Number(row.completion_rate)
          : null,
      profileVisits: row.profile_visits !== undefined && row.profile_visits !== null ? Number(row.profile_visits) : null,
      timestamp: row.timestamp ? String(row.timestamp) : null,
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load story highlights', error);
    return [];
  }
}

async function fetchLatestScripts(client: BigQuery, projectId: string): Promise<ReelScriptSummary[]> {
  const query = `
    SELECT
      title,
      hook,
      body,
      cta,
      story_text,
      inspiration_sources
    FROM \`${projectId}.${DEFAULT_DATASET}.my_reels_scripts\`
    WHERE snapshot_date = (
      SELECT MAX(snapshot_date)
      FROM \`${projectId}.${DEFAULT_DATASET}.my_reels_scripts\`
    )
    ORDER BY created_at DESC
    LIMIT 5
  `;

  try {
    const [rows] = await client.query({
      query,
      location: DEFAULT_LOCATION,
    });

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
