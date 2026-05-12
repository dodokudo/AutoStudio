#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { META_AD_CREATIVES_TABLE, META_AD_INSIGHTS_TABLE, META_ADS_DATASET } from '@/lib/ads/bigquery';
import { fetchMetaAdCreatives, fetchMetaAdInsights, MetaActionMetric, MetaAdInsight, MetaAdWithCreative } from '@/lib/ads/metaApi';

dotenv.config({ path: '.env.local' });

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.BQ_PROJECT_ID);
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';
const ACCESS_TOKEN = process.env.META_ADS_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function metricValue(metrics: MetaActionMetric[] | undefined, names?: string[]): number {
  if (!metrics?.length) return 0;
  if (!names?.length) return toNumber(metrics[0]?.value);
  return metrics
    .filter((metric) => names.some((name) => metric.action_type === name || metric.action_type?.includes(name)))
    .reduce((sum, metric) => sum + toNumber(metric.value), 0);
}

function firstCost(metrics: MetaActionMetric[] | undefined, names: string[]): number {
  if (!metrics?.length) return 0;
  const found = metrics.find((metric) => names.some((name) => metric.action_type === name || metric.action_type?.includes(name)));
  return toNumber(found?.value);
}

const LEAD_ACTIONS = ['lead', 'fb_pixel_lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const COMPLETE_REGISTRATION_ACTIONS = ['complete_registration', 'fb_pixel_complete_registration'];
const PURCHASE_ACTIONS = ['purchase', 'fb_pixel_purchase', 'offsite_conversion.fb_pixel_purchase'];

function inferMediaType(ad: MetaAdWithCreative): string {
  const creative = ad.creative;
  const objectType = creative?.object_type?.toLowerCase() ?? '';
  const permalink = creative?.instagram_permalink_url?.toLowerCase() ?? '';
  const hasVideo = Boolean(creative?.video_id) || objectType.includes('video') || JSON.stringify(creative?.asset_feed_spec ?? {}).includes('video');
  const hasImage = Boolean(creative?.image_url) || objectType.includes('photo') || objectType.includes('share');

  if (permalink.includes('/reel/')) return 'reels';
  if (hasVideo) return 'video';
  if (hasImage) return 'image';
  if (objectType.includes('carousel')) return 'carousel';
  return 'unknown';
}

function mapInsight(row: MetaAdInsight, syncedAt: string) {
  const spend = toNumber(row.spend);
  const leads = Math.round(metricValue(row.actions, LEAD_ACTIONS));
  const completeRegistrations = Math.round(metricValue(row.actions, COMPLETE_REGISTRATION_ACTIONS));
  const purchases = Math.round(metricValue(row.actions, PURCHASE_ACTIONS));
  const purchaseValue = metricValue(row.action_values, PURCHASE_ACTIONS);

  return {
    ad_account_id: AD_ACCOUNT_ID,
    date_start: row.date_start,
    date_stop: row.date_stop,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    adset_id: row.adset_id ?? null,
    adset_name: row.adset_name ?? null,
    ad_id: row.ad_id,
    ad_name: row.ad_name ?? null,
    spend,
    impressions: Math.round(toNumber(row.impressions)),
    reach: Math.round(toNumber(row.reach)),
    frequency: toNumber(row.frequency),
    cpm: toNumber(row.cpm),
    cpp: toNumber(row.cpp),
    clicks: Math.round(toNumber(row.clicks)),
    ctr: toNumber(row.ctr) / 100,
    unique_clicks: Math.round(toNumber(row.unique_clicks)),
    unique_ctr: toNumber(row.unique_ctr) / 100,
    inline_link_clicks: Math.round(toNumber(row.inline_link_clicks)),
    cost_per_inline_link_click: toNumber(row.cost_per_inline_link_click),
    inline_link_click_ctr: toNumber(row.inline_link_click_ctr) / 100,
    video_play_actions: Math.round(metricValue(row.video_play_actions)),
    video_p25_watched_actions: Math.round(metricValue(row.video_p25_watched_actions)),
    video_p50_watched_actions: Math.round(metricValue(row.video_p50_watched_actions)),
    video_p75_watched_actions: Math.round(metricValue(row.video_p75_watched_actions)),
    video_p100_watched_actions: Math.round(metricValue(row.video_p100_watched_actions)),
    video_avg_time_watched_actions: metricValue(row.video_avg_time_watched_actions),
    cost_per_thruplay: metricValue(row.cost_per_thruplay),
    meta_leads: leads,
    meta_complete_registrations: completeRegistrations,
    meta_purchases: purchases,
    meta_purchase_value: purchaseValue,
    meta_lead_cpa: firstCost(row.cost_per_action_type, LEAD_ACTIONS) || (leads > 0 ? spend / leads : 0),
    meta_complete_registration_cpa:
      firstCost(row.cost_per_action_type, COMPLETE_REGISTRATION_ACTIONS) || (completeRegistrations > 0 ? spend / completeRegistrations : 0),
    meta_purchase_cpa: firstCost(row.cost_per_action_type, PURCHASE_ACTIONS) || (purchases > 0 ? spend / purchases : 0),
    actions_json: row.actions ? JSON.stringify(row.actions) : null,
    cost_per_action_type_json: row.cost_per_action_type ? JSON.stringify(row.cost_per_action_type) : null,
    action_values_json: row.action_values ? JSON.stringify(row.action_values) : null,
    synced_at: syncedAt,
  };
}

function mapCreative(ad: MetaAdWithCreative, syncedAt: string) {
  const creative = ad.creative ?? {};
  return {
    ad_account_id: AD_ACCOUNT_ID,
    ad_id: ad.id,
    ad_name: ad.name ?? null,
    ad_status: ad.status ?? null,
    ad_effective_status: ad.effective_status ?? null,
    campaign_id: ad.campaign_id ?? null,
    adset_id: ad.adset_id ?? null,
    creative_id: creative.id ?? null,
    creative_name: creative.name ?? null,
    object_type: creative.object_type ?? null,
    media_type: inferMediaType(ad),
    thumbnail_url: creative.thumbnail_url ?? null,
    image_url: creative.image_url ?? null,
    video_id: creative.video_id ?? null,
    instagram_permalink_url: creative.instagram_permalink_url ?? null,
    object_story_id: creative.object_story_id ?? null,
    effective_object_story_id: creative.effective_object_story_id ?? null,
    object_story_spec_json: creative.object_story_spec ? JSON.stringify(creative.object_story_spec) : null,
    asset_feed_spec_json: creative.asset_feed_spec ? JSON.stringify(creative.asset_feed_spec) : null,
    synced_at: syncedAt,
  };
}

async function insertInChunks(tableName: string, rows: Record<string, unknown>[], chunkSize = 500) {
  if (!rows.length) return;
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const table = client.dataset(META_ADS_DATASET).table(tableName);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await table.insert(chunk, { raw: false, ignoreUnknownValues: true });
    console.log(`[meta-ads] inserted ${chunk.length} rows into ${tableName}`);
  }
}

function resolveRange() {
  const mode = process.argv[2] ?? 'yesterday';
  if (mode === 'maximum') return { datePreset: 'maximum' };
  if (mode === 'last_30d') return { datePreset: 'last_30d' };
  if (mode === 'yesterday') return { datePreset: 'yesterday' };

  const [since, until] = mode.split(':');
  if (/^\d{4}-\d{2}-\d{2}$/.test(since) && /^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return { since, until };
  }
  throw new Error('Usage: npm run meta-ads:sync -- yesterday|last_30d|maximum|YYYY-MM-DD:YYYY-MM-DD');
}

async function replaceInsights(rows: ReturnType<typeof mapInsight>[]) {
  if (!rows.length) {
    console.log('[meta-ads] no insight rows returned');
    return;
  }

  const dates = rows.map((row) => String(row.date_start)).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const client = createBigQueryClient(PROJECT_ID, LOCATION);

  await client.query({
    query: `
      DELETE FROM \`${PROJECT_ID}.${META_ADS_DATASET}.${META_AD_INSIGHTS_TABLE}\`
      WHERE ad_account_id = @adAccountId
        AND date_start BETWEEN @startDate AND @endDate
    `,
    params: { adAccountId: AD_ACCOUNT_ID, startDate, endDate },
  });
  await insertInChunks(META_AD_INSIGHTS_TABLE, rows);
  console.log(`[meta-ads] replaced insights ${startDate} to ${endDate}: ${rows.length} rows`);
}

async function replaceCreatives(rows: ReturnType<typeof mapCreative>[]) {
  await insertInChunks(META_AD_CREATIVES_TABLE, rows);
  console.log(`[meta-ads] appended creatives: ${rows.length} rows`);
}

async function main() {
  if (!ACCESS_TOKEN) throw new Error('META_ADS_ACCESS_TOKEN is required');
  if (!AD_ACCOUNT_ID) throw new Error('META_AD_ACCOUNT_ID is required');

  const range = resolveRange();
  const syncedAt = new Date().toISOString();
  console.log('[meta-ads] fetching insights...', range);

  const [insights, creatives] = await Promise.all([
    fetchMetaAdInsights({ accessToken: ACCESS_TOKEN, adAccountId: AD_ACCOUNT_ID, ...range }),
    fetchMetaAdCreatives({ accessToken: ACCESS_TOKEN, adAccountId: AD_ACCOUNT_ID }),
  ]);

  console.log(`[meta-ads] fetched insights=${insights.length}, creatives=${creatives.length}`);
  await replaceInsights(insights.filter((row) => row.ad_id && row.date_start && row.date_stop).map((row) => mapInsight(row, syncedAt)));
  await replaceCreatives(creatives.map((row) => mapCreative(row, syncedAt)));
  console.log('[meta-ads] sync completed');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[meta-ads] sync failed:', error);
    process.exit(1);
  });
}
