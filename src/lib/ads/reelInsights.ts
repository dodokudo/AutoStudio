import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const DATASET = process.env.META_ADS_DATASET ?? 'autostudio_ads';
const LOCATION = process.env.META_ADS_LOCATION ?? 'asia-northeast1';

export interface ReelAdAdsetMetrics {
  adsetId: string;
  adsetName: string | null;
  audienceType: string | null;
  impressions: number;
  videoPlays: number;
  p2s: number;
  p15s: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  thruplay: number;
  spend: number;
  costPerThruplay: number | null;
}

export interface ReelAdInsightRow {
  permalink: string | null;
  adName: string | null;
  thumbnailUrl: string | null;
  totalImpressions: number;
  totalSpend: number;
  totalClicks: number;
  totalInlineLinkClicks: number;
  totalLeads: number;
  totalVideoPlays: number;
  totalP25: number;
  totalP50: number;
  totalP75: number;
  totalP95: number;
  totalP100: number;
  ctr: number;
  inlineLinkCtr: number;
  cpa: number | null;
  cpc: number;
  cvr: number | null;
  byAdset: ReelAdAdsetMetrics[];
}

export async function getReelAdInsights(startDate: string, endDate: string): Promise<ReelAdInsightRow[]> {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const query = `
    WITH latest_creatives AS (
      SELECT * EXCEPT(rn) FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ad_id ORDER BY synced_at DESC) AS rn
        FROM \`${PROJECT_ID}.${DATASET}.meta_ad_creatives\`
      ) WHERE rn = 1
    ),
    grouped AS (
      SELECT
        c.instagram_permalink_url AS permalink,
        c.ad_name,
        COALESCE(c.image_url, c.thumbnail_url) AS thumbnail_url,
        a.adset_id,
        ANY_VALUE(a.adset_name) AS adset_name,
        ANY_VALUE(s.audience_type) AS audience_type,
        SUM(a.impressions) AS impressions,
        SUM(a.video_play_actions) AS video_plays,
        SUM(a.video_continuous_2_sec_watched_actions) AS p2s,
        SUM(a.video_15_sec_watched_actions) AS p15s,
        SUM(a.video_p25_watched_actions) AS p25,
        SUM(a.video_p50_watched_actions) AS p50,
        SUM(a.video_p75_watched_actions) AS p75,
        SUM(a.video_p95_watched_actions) AS p95,
        SUM(a.video_p100_watched_actions) AS p100,
        SUM(a.video_thruplay_watched_actions) AS thruplay,
        SUM(a.spend) AS spend,
        AVG(a.cost_per_thruplay) AS cost_per_thruplay
      FROM \`${PROJECT_ID}.${DATASET}.meta_ad_insights_daily\` a
      LEFT JOIN latest_creatives c ON a.ad_id = c.ad_id
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.meta_adsets\` s ON a.adset_id = s.adset_id
      WHERE a.platform_position = 'instagram_reels'
        AND a.date_start BETWEEN @startDate AND @endDate
      GROUP BY permalink, ad_name, thumbnail_url, adset_id
    )
    SELECT
      g.permalink,
      ANY_VALUE(g.ad_name) AS ad_name,
      ANY_VALUE(g.thumbnail_url) AS thumbnail_url,
      SUM(g.impressions) AS total_impressions,
      SUM(g.spend) AS total_spend,
      SUM(g.video_plays) AS total_video_plays,
      SUM(g.p25) AS total_p25,
      SUM(g.p50) AS total_p50,
      SUM(g.p75) AS total_p75,
      SUM(g.p95) AS total_p95,
      SUM(g.p100) AS total_p100,
      a_agg.total_clicks,
      a_agg.total_inline_link_clicks,
      a_agg.total_leads,
      ARRAY_AGG(STRUCT(
        g.adset_id, g.adset_name, g.audience_type,
        g.impressions, g.video_plays, g.p2s, g.p15s, g.p25, g.p50, g.p75, g.p95, g.p100, g.thruplay, g.spend, g.cost_per_thruplay
      )) AS adsets
    FROM grouped g
    LEFT JOIN (
      -- クリック/CTR はリール限定
      SELECT
        c.instagram_permalink_url AS permalink,
        SUM(a.clicks) AS total_clicks,
        SUM(a.inline_link_clicks) AS total_inline_link_clicks
      FROM \`${PROJECT_ID}.${DATASET}.meta_ad_insights_daily\` a
      LEFT JOIN latest_creatives c ON a.ad_id = c.ad_id
      WHERE a.platform_position = 'instagram_reels'
        AND a.date_start BETWEEN @startDate AND @endDate
        AND c.instagram_permalink_url IS NOT NULL
      GROUP BY c.instagram_permalink_url
    ) a_agg ON g.permalink = a_agg.permalink
    LEFT JOIN (
      -- LINE登録 (meta_leads) は ad 単位の全プレースメント合算
      -- (Meta API は leads を breakdown=publisher_platform で分割しないため)
      SELECT
        c.instagram_permalink_url AS permalink,
        SUM(a.meta_leads) AS total_leads
      FROM \`${PROJECT_ID}.${DATASET}.meta_ad_insights_daily\` a
      LEFT JOIN latest_creatives c ON a.ad_id = c.ad_id
      WHERE a.date_start BETWEEN @startDate AND @endDate
        AND c.instagram_permalink_url IS NOT NULL
        AND a.platform_position IS NULL
      GROUP BY c.instagram_permalink_url
    ) l_agg ON g.permalink = l_agg.permalink
    GROUP BY g.permalink, a_agg.total_clicks, a_agg.total_inline_link_clicks, a_agg.total_leads
    ORDER BY total_impressions DESC
  `;

  const [rows] = await client.query({ query, params: { startDate, endDate } });

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const totalImpressions = Number(row.total_impressions ?? 0);
    const totalSpend = Number(row.total_spend ?? 0);
    const totalClicks = Number(row.total_clicks ?? 0);
    const totalInlineLinkClicks = Number(row.total_inline_link_clicks ?? 0);
    const totalLeads = Number(row.total_leads ?? 0);
    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const inlineLinkCtr = totalImpressions > 0 ? totalInlineLinkClicks / totalImpressions : 0;
    const cpa = totalLeads > 0 ? totalSpend / totalLeads : null;
    const cpc = totalInlineLinkClicks > 0 ? totalSpend / totalInlineLinkClicks : 0;
    const cvr = totalInlineLinkClicks > 0 ? totalLeads / totalInlineLinkClicks : null;
    return {
    permalink: (row.permalink as string) ?? null,
    adName: (row.ad_name as string) ?? null,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    totalImpressions,
    totalSpend,
    totalClicks,
    totalInlineLinkClicks,
    totalLeads,
    totalVideoPlays: Number(row.total_video_plays ?? 0),
    totalP25: Number(row.total_p25 ?? 0),
    totalP50: Number(row.total_p50 ?? 0),
    totalP75: Number(row.total_p75 ?? 0),
    totalP95: Number(row.total_p95 ?? 0),
    totalP100: Number(row.total_p100 ?? 0),
    ctr,
    inlineLinkCtr,
    cpa,
    cpc,
    cvr,
    byAdset: ((row.adsets as Array<Record<string, unknown>>) ?? []).map((a) => ({
      adsetId: String(a.adset_id ?? ''),
      adsetName: (a.adset_name as string) ?? null,
      audienceType: (a.audience_type as string) ?? null,
      impressions: Number(a.impressions ?? 0),
      videoPlays: Number(a.video_plays ?? 0),
      p2s: Number(a.p2s ?? 0),
      p15s: Number(a.p15s ?? 0),
      p25: Number(a.p25 ?? 0),
      p50: Number(a.p50 ?? 0),
      p75: Number(a.p75 ?? 0),
      p95: Number(a.p95 ?? 0),
      p100: Number(a.p100 ?? 0),
      thruplay: Number(a.thruplay ?? 0),
      spend: Number(a.spend ?? 0),
      costPerThruplay: a.cost_per_thruplay !== null ? Number(a.cost_per_thruplay) : null,
    })),
    };
  });
}
