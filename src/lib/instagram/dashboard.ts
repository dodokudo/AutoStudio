import { createBigQueryClient } from '@/lib/bigquery';
import { loadInstagramConfig } from './config';
import { listLineSourceRegistrations } from '@/lib/lstep/dashboard';
import type { ReelMetricsDashboardData } from './reelMetricsDashboard';
import type { StoryMetricsDashboardData } from './storyMetricsDashboard';
import type { CompetitorDashboardData } from './competitorDashboard';
import type { ScriptLibraryData } from './scriptLibrary';
import { getInstagramLpLineClicksByRange } from '@/lib/links/analytics';
import type { BigQuery } from '@google-cloud/bigquery';

const DEFAULT_DATASET = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
const DEFAULT_LOCATION = process.env.IG_GCP_LOCATION ?? 'asia-northeast1';
const LINE_REGISTRATION_LOOKBACK_DAYS = 120;

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
  driveImageUrl: string | null;
  thumbnailUrl: string | null;
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
  driveImageUrl: string | null;
  thumbnailUrl: string | null;
}

export interface ReelScriptSummary {
  title: string;
  hook: string;
  body: string;
  cta: string;
  storyText: string;
  inspirationSources: string[];
}

export interface DailyContentStat {
  date: string;
  count: number;
  views: number;
}

export interface LatestUserInsights {
  snapshotAt: string;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  accountsEngaged: number | null;
  profileLinksTaps: number | null;
}

export interface UserInsightsDailyPoint {
  date: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
}

export interface InstagramDashboardData {
  followerSeries: FollowerPoint[];
  latestFollower?: FollowerPoint;
  reels: ReelHighlight[];
  stories: StoryHighlight[];
  scripts: ReelScriptSummary[];
  lineRegistrationCount: number | null;
  lineRegistrationSeries: { date: string; count: number }[];
  linkClickCount: number | null;
  linkClickSeries: { date: string; count: number }[];
  reelMetricsData: ReelMetricsDashboardData | null;
  storyDailyCounts: DailyContentStat[];
  reelDailyCounts: DailyContentStat[];
  lpLineCtaClickCount: number | null;
  lpLineCtaClickSeries: { date: string; clicks: number }[];
  latestUserInsights: LatestUserInsights | null;
  userInsightsDailySeries: UserInsightsDailyPoint[];
  storyMetricsData: StoryMetricsDashboardData | null;
  competitorData: CompetitorDashboardData | null;
  scriptLibraryData: ScriptLibraryData | null;
}

export async function getInstagramDashboardData(projectId: string): Promise<InstagramDashboardData> {
  console.log('[instagram/dashboard] getInstagramDashboardData called with projectId:', projectId);
  const config = loadInstagramConfig();
  console.log('[instagram/dashboard] Config loaded, defaultUserId:', config.defaultUserId);
  const client = createBigQueryClient(projectId, DEFAULT_LOCATION);
  console.log('[instagram/dashboard] BigQuery client created');

  // 詳細タブ用の重いデータはクライアント側で遅延ロードする。
  const [followerSeries, stories, linkClickSeries, storyDailyCounts, reelDailyCounts, latestUserInsights, userInsightsDailySeries] = await Promise.all([
    fetchFollowerSeries(client, projectId, config.defaultUserId),
    fetchStoryHighlights(client, projectId, config.defaultUserId),
    fetchLinkClickSeries(client, projectId),
    fetchStoryDailyCounts(client, projectId, config.defaultUserId),
    fetchReelDailyCounts(client, projectId, config.defaultUserId),
    fetchLatestUserInsights(client, projectId),
    fetchUserInsightsDailySeries(client, projectId),
  ]);
  const reels: ReelHighlight[] = [];
  const scripts: ReelScriptSummary[] = [];
  const reelMetricsData: ReelMetricsDashboardData | null = null;
  const storyMetricsData: StoryMetricsDashboardData | null = null;
  const competitorData: CompetitorDashboardData | null = null;
  const scriptLibraryData: ScriptLibraryData | null = null;

  console.log('[instagram/dashboard] Data fetched - followerSeries:', followerSeries.length, 'reels:', reels.length, 'stories:', stories.length);

  const lineRangeEnd = new Date();
  const lineRangeStart = new Date(lineRangeEnd.getTime());
  lineRangeStart.setUTCDate(lineRangeStart.getUTCDate() - LINE_REGISTRATION_LOOKBACK_DAYS + 1);

  let lineRegistrationSeries: { date: string; count: number }[] = [];
  let lineRegistrationCount: number | null = null;
  try {
    const series = await listLineSourceRegistrations(projectId, {
      sourceName: 'Instagram',
      startDate: lineRangeStart.toISOString().slice(0, 10),
      endDate: lineRangeEnd.toISOString().slice(0, 10),
    });
    lineRegistrationSeries = series.map((point) => ({
      date: point.date,
      count: point.count,
    }));
    lineRegistrationCount = lineRegistrationSeries.reduce((sum, point) => sum + point.count, 0);
  } catch (lineError) {
    console.warn('[instagram/dashboard] Failed to load LINE registration count', lineError);
  }

  const linkClickCount = linkClickSeries.reduce((sum, point) => sum + point.count, 0);

  let lpLineCtaClickSeries: { date: string; clicks: number }[] = [];
  let lpLineCtaClickCount: number | null = null;
  try {
    lpLineCtaClickSeries = await getInstagramLpLineClicksByRange(lineRangeStart, lineRangeEnd);
    lpLineCtaClickCount = lpLineCtaClickSeries.reduce((sum, point) => sum + point.clicks, 0);
  } catch (err) {
    console.warn('[instagram/dashboard] Failed to load lpLineCtaClick series', err);
  }

  return {
    followerSeries,
    latestFollower: followerSeries[0],
    reels,
    stories,
    scripts,
    lineRegistrationCount,
    lineRegistrationSeries,
    linkClickCount,
    linkClickSeries,
    reelMetricsData,
    storyDailyCounts,
    reelDailyCounts,
    lpLineCtaClickCount,
    lpLineCtaClickSeries,
    latestUserInsights,
    userInsightsDailySeries,
    storyMetricsData,
    competitorData,
    scriptLibraryData,
  };
}

async function fetchLatestUserInsights(client: BigQuery, projectId: string): Promise<LatestUserInsights | null> {
  const query = `
    SELECT
      snapshot_at,
      followers_count,
      follows_count,
      media_count,
      reach,
      views,
      total_interactions,
      accounts_engaged,
      profile_links_taps
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_user_insights_snapshots\`
    ORDER BY snapshot_at DESC
    LIMIT 1
  `;
  try {
    const [rows] = await client.query({ query, location: DEFAULT_LOCATION });
    if (!rows.length) return null;
    const row = rows[0];
    const snapshotAtRaw = row.snapshot_at;
    const snapshotAt = snapshotAtRaw && typeof snapshotAtRaw === 'object' && 'value' in snapshotAtRaw
      ? String(snapshotAtRaw.value)
      : String(snapshotAtRaw ?? '');
    return {
      snapshotAt,
      followersCount: row.followers_count !== null && row.followers_count !== undefined ? Number(row.followers_count) : null,
      followsCount: row.follows_count !== null && row.follows_count !== undefined ? Number(row.follows_count) : null,
      mediaCount: row.media_count !== null && row.media_count !== undefined ? Number(row.media_count) : null,
      reach: row.reach !== null && row.reach !== undefined ? Number(row.reach) : null,
      views: row.views !== null && row.views !== undefined ? Number(row.views) : null,
      totalInteractions: row.total_interactions !== null && row.total_interactions !== undefined ? Number(row.total_interactions) : null,
      accountsEngaged: row.accounts_engaged !== null && row.accounts_engaged !== undefined ? Number(row.accounts_engaged) : null,
      profileLinksTaps: row.profile_links_taps !== null && row.profile_links_taps !== undefined ? Number(row.profile_links_taps) : null,
    };
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to fetch latestUserInsights', error);
    return null;
  }
}

async function fetchUserInsightsDailySeries(client: BigQuery, projectId: string): Promise<UserInsightsDailyPoint[]> {
  const query = `
    WITH daily_latest AS (
      SELECT
        snapshot_date,
        followers_count,
        reach,
        views,
        total_interactions,
        ROW_NUMBER() OVER (PARTITION BY snapshot_date ORDER BY snapshot_at DESC) AS rn
      FROM \`${projectId}.${DEFAULT_DATASET}.instagram_user_insights_snapshots\`
      WHERE snapshot_date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 90 DAY)
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', snapshot_date) AS date,
      followers_count,
      reach,
      views,
      total_interactions
    FROM daily_latest
    WHERE rn = 1
    ORDER BY snapshot_date DESC
  `;
  try {
    const [rows] = await client.query({ query, location: DEFAULT_LOCATION });
    return rows.map((row) => ({
      date: String(row.date),
      followers: row.followers_count !== null && row.followers_count !== undefined ? Number(row.followers_count) : null,
      reach: row.reach !== null && row.reach !== undefined ? Number(row.reach) : null,
      views: row.views !== null && row.views !== undefined ? Number(row.views) : null,
      totalInteractions: row.total_interactions !== null && row.total_interactions !== undefined ? Number(row.total_interactions) : null,
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to fetch userInsightsDailySeries', error);
    return [];
  }
}

async function fetchStoryDailyCounts(client: BigQuery, projectId: string, userId: string): Promise<DailyContentStat[]> {
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(timestamp, 'Asia/Tokyo')) AS date,
      COUNT(*) AS count,
      MAX(COALESCE(reach, 0)) AS views
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_stories\`
    WHERE user_id = @user_id
      AND timestamp IS NOT NULL
      AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
    GROUP BY date
    ORDER BY date DESC
  `;
  try {
    const [rows] = await client.query({ query, params: { user_id: userId }, location: DEFAULT_LOCATION });
    return rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count ?? 0),
      views: Number(row.views ?? 0),
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to fetch story daily counts', error);
    return [];
  }
}

async function fetchReelDailyCounts(client: BigQuery, projectId: string, userId: string): Promise<DailyContentStat[]> {
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(timestamp, 'Asia/Tokyo')) AS date,
      COUNT(*) AS count,
      MAX(COALESCE(views, 0)) AS views
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_reels\`
    WHERE user_id = @user_id
      AND timestamp IS NOT NULL
      AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
    GROUP BY date
    ORDER BY date DESC
  `;
  try {
    const [rows] = await client.query({ query, params: { user_id: userId }, location: DEFAULT_LOCATION });
    return rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count ?? 0),
      views: Number(row.views ?? 0),
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to fetch reel daily counts', error);
    return [];
  }
}

async function fetchFollowerSeries(client: BigQuery, projectId: string, userId: string): Promise<FollowerPoint[]> {
  console.log('[instagram/dashboard] fetchFollowerSeries called with userId:', userId);
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
    console.log('[instagram/dashboard] Executing BigQuery query with params:', { user_id: userId, projectId, dataset: DEFAULT_DATASET, location: DEFAULT_LOCATION });
    const [rows] = await client.query({
      query,
      params: { user_id: userId },
      location: DEFAULT_LOCATION,
    });

    console.log('[instagram/dashboard] fetchFollowerSeries returned', rows.length, 'rows');
    if (rows.length === 0) {
      console.warn('[instagram/dashboard] No follower data found for userId:', userId);
      console.warn('[instagram/dashboard] This may indicate user_id mismatch or missing data in BigQuery');
    }
    return rows.map((row) => ({
      date: String(row.date),
      followers: Number(row.followers ?? 0),
      reach: Number(row.reach ?? 0),
      engagement: Number(row.engagement ?? 0),
    }));
  } catch (error) {
    console.error('[instagram/dashboard] Failed to load follower series for userId:', userId);
    console.error('[instagram/dashboard] Error details:', error);
    console.error('[instagram/dashboard] Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.message.includes('Permission denied')) {
      throw new Error(`BigQuery permission error: ${error.message}`);
    }
    throw error;
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
      drive_image_url,
      thumbnail_url,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', timestamp) AS timestamp
    FROM \`${projectId}.${DEFAULT_DATASET}.instagram_reels\`
    WHERE user_id = @user_id
    ORDER BY timestamp DESC
    LIMIT 500
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
      driveImageUrl: row.drive_image_url ? String(row.drive_image_url) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      timestamp: row.timestamp ? String(row.timestamp) : null,
    }));
  } catch (error) {
    console.error('[instagram/dashboard] Failed to load reel highlights for userId:', userId);
    console.error('[instagram/dashboard] Reel error:', error instanceof Error ? error.message : String(error));
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
      drive_image_url,
      thumbnail_url,
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
      driveImageUrl: row.drive_image_url ? String(row.drive_image_url) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      timestamp: row.timestamp ? String(row.timestamp) : null,
    }));
  } catch (error) {
    console.error('[instagram/dashboard] Failed to load story highlights for userId:', userId);
    console.error('[instagram/dashboard] Story error:', error instanceof Error ? error.message : String(error));
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

async function fetchLinkClickSeries(client: BigQuery, projectId: string): Promise<{ date: string; count: number }[]> {
  // 旧運用: 短縮URL(category='instagram') click_logs
  // 新運用: lkit.jp直URL からのLPアクセス launchkit_events(page_view, source='instagram')
  // 両方をUNION ALLして日別合算
  const query = `
    WITH latest_links AS (
      SELECT
        id,
        category,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
      FROM \`${projectId}.autostudio_links.short_links\`
      WHERE is_active = true
    ),
    legacy_clicks AS (
      SELECT DATE(c.clicked_at, 'Asia/Tokyo') AS date
      FROM \`${projectId}.autostudio_links.click_logs\` c
      JOIN latest_links s
        ON c.short_link_id = s.id
        AND s.rn = 1
      WHERE s.category = 'instagram'
        AND DATE(c.clicked_at, 'Asia/Tokyo') >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 120 DAY)
    ),
    launchkit_views AS (
      SELECT DATE(occurred_at, 'Asia/Tokyo') AS date
      FROM \`${projectId}.autostudio_links.launchkit_events\`
      WHERE event_type = 'page_view'
        AND source = 'instagram'
        AND DATE(occurred_at, 'Asia/Tokyo') >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 120 DAY)
    ),
    combined AS (
      SELECT date FROM legacy_clicks
      UNION ALL
      SELECT date FROM launchkit_views
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', date) as date,
      COUNT(*) as click_count
    FROM combined
    GROUP BY date
    ORDER BY date DESC
  `;

  try {
    const [rows] = await client.query({
      query,
      location: DEFAULT_LOCATION,
    });

    return rows.map((row) => ({
      date: String(row.date),
      count: Number(row.click_count ?? 0),
    }));
  } catch (error) {
    console.warn('[instagram/dashboard] Failed to load link click series', error);
    return [];
  }
}
