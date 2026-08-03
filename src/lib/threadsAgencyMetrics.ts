import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const ANALYCA_DATASET = 'analyca';
const LINKS_DATASET = 'autostudio_links';
const LSTEP_DATASET = 'autostudio_lstep';
const YAMAZAKI_USER_ID = '26743384212021461';
const YAMAZAKI_LP_SHORT_CODE = '6m_ag';
const YAMAZAKI_CTA_SHORT_CODE = 'M2J4mM';
const YAMAZAKI_TAG_NAME = 'YAMAZAKI';
const BOT_USER_AGENT_PATTERN = 'curl|notebot|bot|crawler|spider|preview';

export interface ThreadsAgencyMetrics {
  followers: number;
  followerDelta: number;
  posts: number;
  impressions: number;
  lpClicks: number;
  lpCtaClicks: number;
  lineRegistrations: number;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getThreadsAgencyMetrics(
  startDate: string,
  endDate: string,
): Promise<ThreadsAgencyMetrics> {
  const bigquery = createBigQueryClient(projectId);
  const query = `
    WITH period AS (
      SELECT DATE(@startDate) AS start_date, DATE(@endDate) AS end_date
    ),
    post_metrics AS (
      SELECT
        COUNT(*) AS posts,
        COALESCE(SUM(views), 0) AS impressions
      FROM \`${projectId}.${ANALYCA_DATASET}.threads_posts\`, period
      WHERE user_id = @userId
        AND DATE(timestamp, "Asia/Tokyo") BETWEEN start_date AND end_date
    ),
    ranked_daily AS (
      SELECT
        SAFE.PARSE_DATE('%Y-%m-%d', date) AS metric_date,
        followers_count,
        follower_delta,
        ROW_NUMBER() OVER (PARTITION BY date ORDER BY updated_at DESC) AS rn
      FROM \`${projectId}.${ANALYCA_DATASET}.threads_daily_metrics\`, period
      WHERE user_id = @userId
        AND SAFE.PARSE_DATE('%Y-%m-%d', date) <= end_date
    ),
    follower_metrics AS (
      SELECT
        ARRAY_AGG(followers_count IGNORE NULLS ORDER BY metric_date DESC LIMIT 1)[SAFE_OFFSET(0)] AS followers,
        COALESCE(SUM(IF(metric_date BETWEEN start_date AND end_date, follower_delta, 0)), 0) AS follower_delta
      FROM ranked_daily
      CROSS JOIN period
      WHERE rn = 1
    ),
    latest_links AS (
      SELECT
        id,
        short_code,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS rn
      FROM \`${projectId}.${LINKS_DATASET}.short_links\`
      WHERE is_active = TRUE
        AND short_code IN (@lpShortCode, @ctaShortCode)
    ),
    click_metrics AS (
      SELECT
        links.short_code,
        COUNT(*) AS clicks
      FROM \`${projectId}.${LINKS_DATASET}.click_logs\` clicks
      JOIN latest_links links
        ON clicks.short_link_id = links.id
        AND links.rn = 1
      CROSS JOIN period
      WHERE DATE(clicks.clicked_at, "Asia/Tokyo") BETWEEN start_date AND end_date
        AND NOT REGEXP_CONTAINS(LOWER(COALESCE(clicks.user_agent, '')), @botPattern)
      GROUP BY links.short_code
    ),
    latest_core AS (
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM \`${projectId}.${LSTEP_DATASET}.user_core\`
    ),
    latest_tags AS (
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM \`${projectId}.${LSTEP_DATASET}.user_tags\`
      WHERE tag_name = @tagName
    ),
    yamazaki_users AS (
      SELECT DISTINCT tags.user_id
      FROM \`${projectId}.${LSTEP_DATASET}.user_tags\` tags
      JOIN latest_tags USING (snapshot_date)
      WHERE tags.tag_name = @tagName
        AND tags.tag_flag = 1
    ),
    line_metrics AS (
      SELECT COUNT(DISTINCT core.user_id) AS line_registrations
      FROM \`${projectId}.${LSTEP_DATASET}.user_core\` core
      JOIN latest_core USING (snapshot_date)
      JOIN yamazaki_users USING (user_id)
      CROSS JOIN period
      WHERE SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(core.friend_added_at, 1, 10))
        BETWEEN start_date AND end_date
    )
    SELECT
      followers.followers,
      followers.follower_delta,
      posts.posts,
      posts.impressions,
      COALESCE((SELECT clicks FROM click_metrics WHERE short_code = @lpShortCode), 0) AS lp_clicks,
      COALESCE((SELECT clicks FROM click_metrics WHERE short_code = @ctaShortCode), 0) AS lp_cta_clicks,
      line.line_registrations
    FROM post_metrics posts
    CROSS JOIN follower_metrics followers
    CROSS JOIN line_metrics line
  `;

  const [rows] = await bigquery.query({
    query,
    params: {
      startDate,
      endDate,
      userId: YAMAZAKI_USER_ID,
      lpShortCode: YAMAZAKI_LP_SHORT_CODE,
      ctaShortCode: YAMAZAKI_CTA_SHORT_CODE,
      tagName: YAMAZAKI_TAG_NAME,
      botPattern: BOT_USER_AGENT_PATTERN,
    },
  });
  const row = (rows[0] ?? {}) as Record<string, unknown>;

  return {
    followers: toNumber(row.followers),
    followerDelta: toNumber(row.follower_delta),
    posts: toNumber(row.posts),
    impressions: toNumber(row.impressions),
    lpClicks: toNumber(row.lp_clicks),
    lpCtaClicks: toNumber(row.lp_cta_clicks),
    lineRegistrations: toNumber(row.line_registrations),
  };
}
