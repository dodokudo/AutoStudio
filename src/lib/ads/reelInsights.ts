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
  totalVideoPlays: number;
  totalP25: number;
  totalP50: number;
  totalP75: number;
  totalP95: number;
  totalP100: number;
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
        c.thumbnail_url,
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
      permalink,
      ANY_VALUE(ad_name) AS ad_name,
      ANY_VALUE(thumbnail_url) AS thumbnail_url,
      SUM(impressions) AS total_impressions,
      SUM(spend) AS total_spend,
      SUM(video_plays) AS total_video_plays,
      SUM(p25) AS total_p25,
      SUM(p50) AS total_p50,
      SUM(p75) AS total_p75,
      SUM(p95) AS total_p95,
      SUM(p100) AS total_p100,
      ARRAY_AGG(STRUCT(
        adset_id, adset_name, audience_type,
        impressions, video_plays, p2s, p15s, p25, p50, p75, p95, p100, thruplay, spend, cost_per_thruplay
      )) AS adsets
    FROM grouped
    GROUP BY permalink
    ORDER BY total_impressions DESC
  `;

  const [rows] = await client.query({ query, params: { startDate, endDate } });

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    permalink: (row.permalink as string) ?? null,
    adName: (row.ad_name as string) ?? null,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    totalImpressions: Number(row.total_impressions ?? 0),
    totalSpend: Number(row.total_spend ?? 0),
    totalVideoPlays: Number(row.total_video_plays ?? 0),
    totalP25: Number(row.total_p25 ?? 0),
    totalP50: Number(row.total_p50 ?? 0),
    totalP75: Number(row.total_p75 ?? 0),
    totalP95: Number(row.total_p95 ?? 0),
    totalP100: Number(row.total_p100 ?? 0),
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
  }));
}
