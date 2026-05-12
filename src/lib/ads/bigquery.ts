import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { countLineRegistrationsByDateRange } from '@/lib/lstep/analytics';

export const META_ADS_DATASET = process.env.META_ADS_BQ_DATASET ?? 'autostudio_ads';
export const META_AD_INSIGHTS_TABLE = 'meta_ad_insights_daily';
export const META_AD_CREATIVES_TABLE = 'meta_ad_creatives';

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.BQ_PROJECT_ID);
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDateString(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    return value.value.slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export interface AdsDashboardSummary {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  leads: number;
  completeRegistrations: number;
  purchases: number;
  purchaseValue: number;
  lineRegistrations: number;
  cpm: number;
  cpc: number;
  lpc: number;
  metaLeadCpa: number;
  lineCpa: number;
  ctr: number;
  inlineLinkCtr: number;
}

export interface AdsDailyPoint {
  date: string;
  spend: number;
  impressions: number;
  inlineLinkClicks: number;
  leads: number;
  purchases: number;
}

export interface AdsByAdRow {
  adId: string;
  adName: string;
  campaignName: string;
  adsetName: string;
  mediaType: string;
  thumbnailUrl: string | null;
  instagramPermalinkUrl: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  inlineLinkClicks: number;
  leads: number;
  purchases: number;
  purchaseValue: number;
  cpm: number;
  cpc: number;
  lpc: number;
  metaLeadCpa: number;
  ctr: number;
  inlineLinkCtr: number;
}

export interface AdsByMediaTypeRow {
  mediaType: string;
  ads: number;
  spend: number;
  impressions: number;
  inlineLinkClicks: number;
  leads: number;
  purchases: number;
  metaLeadCpa: number;
  lpc: number;
}

export interface AdsDashboardData {
  summary: AdsDashboardSummary;
  daily: AdsDailyPoint[];
  byAd: AdsByAdRow[];
  byMediaType: AdsByMediaTypeRow[];
  latestSyncedAt: string | null;
  hasData: boolean;
}

const emptySummary: AdsDashboardSummary = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  inlineLinkClicks: 0,
  leads: 0,
  completeRegistrations: 0,
  purchases: 0,
  purchaseValue: 0,
  lineRegistrations: 0,
  cpm: 0,
  cpc: 0,
  lpc: 0,
  metaLeadCpa: 0,
  lineCpa: 0,
  ctr: 0,
  inlineLinkCtr: 0,
};

async function tableExists(tableName: string): Promise<boolean> {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const [exists] = await client.dataset(META_ADS_DATASET).table(tableName).exists();
  return exists;
}

export async function getAdsDashboardData(startDate: string, endDate: string): Promise<AdsDashboardData> {
  const insightsReady = await tableExists(META_AD_INSIGHTS_TABLE).catch(() => false);
  if (!insightsReady) {
    return {
      summary: emptySummary,
      daily: [],
      byAd: [],
      byMediaType: [],
      latestSyncedAt: null,
      hasData: false,
    };
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const lineRegistrations = await countLineRegistrationsByDateRange(PROJECT_ID, startDate, endDate).catch(() => 0);

  const [summaryRows, dailyRows, adRows, mediaRows, latestRows] = await Promise.all([
    client.query({
      query: `
        SELECT
          SUM(spend) AS spend,
          SUM(impressions) AS impressions,
          SUM(reach) AS reach,
          SUM(clicks) AS clicks,
          SUM(inline_link_clicks) AS inline_link_clicks,
          SUM(meta_leads) AS leads,
          SUM(meta_complete_registrations) AS complete_registrations,
          SUM(meta_purchases) AS purchases,
          SUM(meta_purchase_value) AS purchase_value
        FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\`
        WHERE date_start BETWEEN @startDate AND @endDate
      `,
      params: { startDate, endDate },
    }),
    client.query({
      query: `
        SELECT
          CAST(date_start AS STRING) AS date,
          SUM(spend) AS spend,
          SUM(impressions) AS impressions,
          SUM(inline_link_clicks) AS inline_link_clicks,
          SUM(meta_leads) AS leads,
          SUM(meta_purchases) AS purchases
        FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\`
        WHERE date_start BETWEEN @startDate AND @endDate
        GROUP BY date
        ORDER BY date
      `,
      params: { startDate, endDate },
    }),
    client.query({
      query: `
        SELECT
          i.ad_id,
          ANY_VALUE(i.ad_name) AS ad_name,
          ANY_VALUE(i.campaign_name) AS campaign_name,
          ANY_VALUE(i.adset_name) AS adset_name,
          ANY_VALUE(COALESCE(c.media_type, 'unknown')) AS media_type,
          ANY_VALUE(c.thumbnail_url) AS thumbnail_url,
          ANY_VALUE(c.instagram_permalink_url) AS instagram_permalink_url,
          SUM(i.spend) AS spend,
          SUM(i.impressions) AS impressions,
          SUM(i.clicks) AS clicks,
          SUM(i.inline_link_clicks) AS inline_link_clicks,
          SUM(i.meta_leads) AS leads,
          SUM(i.meta_purchases) AS purchases,
          SUM(i.meta_purchase_value) AS purchase_value
        FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\` i
        LEFT JOIN (
          SELECT * EXCEPT(row_num)
          FROM (
            SELECT
              *,
              ROW_NUMBER() OVER (PARTITION BY ad_account_id, ad_id ORDER BY synced_at DESC) AS row_num
            FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_CREATIVES_TABLE}\`
          )
          WHERE row_num = 1
        ) c
          ON i.ad_account_id = c.ad_account_id
          AND i.ad_id = c.ad_id
        WHERE i.date_start BETWEEN @startDate AND @endDate
        GROUP BY i.ad_id
        ORDER BY spend DESC
        LIMIT 50
      `,
      params: { startDate, endDate },
    }),
    client.query({
      query: `
        SELECT
          COALESCE(c.media_type, 'unknown') AS media_type,
          COUNT(DISTINCT i.ad_id) AS ads,
          SUM(i.spend) AS spend,
          SUM(i.impressions) AS impressions,
          SUM(i.inline_link_clicks) AS inline_link_clicks,
          SUM(i.meta_leads) AS leads,
          SUM(i.meta_purchases) AS purchases
        FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\` i
        LEFT JOIN (
          SELECT * EXCEPT(row_num)
          FROM (
            SELECT
              *,
              ROW_NUMBER() OVER (PARTITION BY ad_account_id, ad_id ORDER BY synced_at DESC) AS row_num
            FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_CREATIVES_TABLE}\`
          )
          WHERE row_num = 1
        ) c
          ON i.ad_account_id = c.ad_account_id
          AND i.ad_id = c.ad_id
        WHERE i.date_start BETWEEN @startDate AND @endDate
        GROUP BY media_type
        ORDER BY spend DESC
      `,
      params: { startDate, endDate },
    }),
    client.query({
      query: `
        SELECT CAST(MAX(synced_at) AS STRING) AS latest_synced_at
        FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\`
      `,
    }),
  ]);

  const summaryRaw = (summaryRows[0] as Array<Record<string, unknown>>)[0] ?? {};
  const spend = toNumber(summaryRaw.spend);
  const impressions = toNumber(summaryRaw.impressions);
  const clicks = toNumber(summaryRaw.clicks);
  const inlineLinkClicks = toNumber(summaryRaw.inline_link_clicks);
  const leads = toNumber(summaryRaw.leads);

  const summary: AdsDashboardSummary = {
    spend,
    impressions,
    reach: toNumber(summaryRaw.reach),
    clicks,
    inlineLinkClicks,
    leads,
    completeRegistrations: toNumber(summaryRaw.complete_registrations),
    purchases: toNumber(summaryRaw.purchases),
    purchaseValue: toNumber(summaryRaw.purchase_value),
    lineRegistrations,
    cpm: safeRate(spend, impressions) * 1000,
    cpc: safeRate(spend, clicks),
    lpc: safeRate(spend, inlineLinkClicks),
    metaLeadCpa: safeRate(spend, leads),
    lineCpa: safeRate(spend, lineRegistrations),
    ctr: safeRate(clicks, impressions),
    inlineLinkCtr: safeRate(inlineLinkClicks, impressions),
  };

  const daily = (dailyRows[0] as Array<Record<string, unknown>>).map((row) => ({
    date: toDateString(row.date),
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    inlineLinkClicks: toNumber(row.inline_link_clicks),
    leads: toNumber(row.leads),
    purchases: toNumber(row.purchases),
  }));

  const byAd = (adRows[0] as Array<Record<string, unknown>>).map((row) => {
    const rowSpend = toNumber(row.spend);
    const rowImpressions = toNumber(row.impressions);
    const rowClicks = toNumber(row.clicks);
    const rowInlineLinkClicks = toNumber(row.inline_link_clicks);
    const rowLeads = toNumber(row.leads);
    return {
      adId: String(row.ad_id ?? ''),
      adName: String(row.ad_name ?? '不明'),
      campaignName: String(row.campaign_name ?? '不明'),
      adsetName: String(row.adset_name ?? '不明'),
      mediaType: String(row.media_type ?? 'unknown'),
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      instagramPermalinkUrl: row.instagram_permalink_url ? String(row.instagram_permalink_url) : null,
      spend: rowSpend,
      impressions: rowImpressions,
      clicks: rowClicks,
      inlineLinkClicks: rowInlineLinkClicks,
      leads: rowLeads,
      purchases: toNumber(row.purchases),
      purchaseValue: toNumber(row.purchase_value),
      cpm: safeRate(rowSpend, rowImpressions) * 1000,
      cpc: safeRate(rowSpend, rowClicks),
      lpc: safeRate(rowSpend, rowInlineLinkClicks),
      metaLeadCpa: safeRate(rowSpend, rowLeads),
      ctr: safeRate(rowClicks, rowImpressions),
      inlineLinkCtr: safeRate(rowInlineLinkClicks, rowImpressions),
    };
  });

  const byMediaType = (mediaRows[0] as Array<Record<string, unknown>>).map((row) => {
    const rowSpend = toNumber(row.spend);
    const rowInlineLinkClicks = toNumber(row.inline_link_clicks);
    const rowLeads = toNumber(row.leads);
    return {
      mediaType: String(row.media_type ?? 'unknown'),
      ads: toNumber(row.ads),
      spend: rowSpend,
      impressions: toNumber(row.impressions),
      inlineLinkClicks: rowInlineLinkClicks,
      leads: rowLeads,
      purchases: toNumber(row.purchases),
      metaLeadCpa: safeRate(rowSpend, rowLeads),
      lpc: safeRate(rowSpend, rowInlineLinkClicks),
    };
  });

  const latestSyncedAt = String((latestRows[0] as Array<Record<string, unknown>>)[0]?.latest_synced_at ?? '') || null;

  return {
    summary,
    daily,
    byAd,
    byMediaType,
    latestSyncedAt,
    hasData: spend > 0 || impressions > 0 || byAd.length > 0,
  };
}
