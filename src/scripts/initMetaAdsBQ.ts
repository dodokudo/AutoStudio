#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { META_ADS_DATASET, META_AD_CREATIVES_TABLE, META_AD_INSIGHTS_TABLE } from '@/lib/ads/bigquery';

dotenv.config({ path: '.env.local' });

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.BQ_PROJECT_ID);
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';

async function ensureDataset() {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(META_ADS_DATASET);
  const [exists] = await dataset.exists();
  if (exists) {
    console.log(`Dataset ${META_ADS_DATASET} already exists`);
    return;
  }

  await dataset.create({
    location: LOCATION,
    description: 'AutoStudio Meta Ads reporting data',
  });
  console.log(`Dataset ${META_ADS_DATASET} created`);
}

async function ensureInsightsTable() {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const table = client.dataset(META_ADS_DATASET).table(META_AD_INSIGHTS_TABLE);
  const [exists] = await table.exists();
  if (exists) {
    console.log(`Table ${META_AD_INSIGHTS_TABLE} already exists`);
    return;
  }

  await table.create({
    schema: [
      { name: 'ad_account_id', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'date_start', type: 'DATE', mode: 'REQUIRED' as const },
      { name: 'date_stop', type: 'DATE', mode: 'REQUIRED' as const },
      { name: 'campaign_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'campaign_name', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'adset_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'adset_name', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'ad_id', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'ad_name', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'spend', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'impressions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'reach', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'frequency', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'cpm', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'cpp', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'clicks', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'ctr', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'unique_clicks', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'unique_ctr', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'inline_link_clicks', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'cost_per_inline_link_click', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'inline_link_click_ctr', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'video_play_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_p25_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_p50_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_p75_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_p95_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_p100_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_continuous_2_sec_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_15_sec_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_30_sec_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_thruplay_watched_actions', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'video_avg_time_watched_actions', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'cost_per_thruplay', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'publisher_platform', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'platform_position', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'meta_leads', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'meta_complete_registrations', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'meta_purchases', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'meta_purchase_value', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'meta_lead_cpa', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'meta_complete_registration_cpa', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'meta_purchase_cpa', type: 'FLOAT64', mode: 'NULLABLE' as const },
      { name: 'actions_json', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'cost_per_action_type_json', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'action_values_json', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'synced_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
    ],
    description: 'Meta Marketing API insights by day and ad',
    timePartitioning: { type: 'DAY', field: 'date_start' },
    clustering: { fields: ['ad_account_id', 'campaign_id', 'adset_id', 'ad_id'] },
  });
  console.log(`Table ${META_AD_INSIGHTS_TABLE} created`);
}

async function ensureCreativesTable() {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const table = client.dataset(META_ADS_DATASET).table(META_AD_CREATIVES_TABLE);
  const [exists] = await table.exists();
  if (exists) {
    console.log(`Table ${META_AD_CREATIVES_TABLE} already exists`);
    return;
  }

  await table.create({
    schema: [
      { name: 'ad_account_id', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'ad_id', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'ad_name', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'ad_status', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'ad_effective_status', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'campaign_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'adset_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'creative_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'creative_name', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'object_type', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'media_type', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'thumbnail_url', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'image_url', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'video_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'instagram_permalink_url', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'object_story_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'effective_object_story_id', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'object_story_spec_json', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'asset_feed_spec_json', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'synced_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
    ],
    description: 'Meta Ads creative metadata for media type and thumbnail reporting',
    clustering: { fields: ['ad_account_id', 'ad_id', 'media_type'] },
  });
  console.log(`Table ${META_AD_CREATIVES_TABLE} created`);
}

async function main() {
  console.log('Initializing Meta Ads BigQuery tables...');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Dataset: ${META_ADS_DATASET}`);
  await ensureDataset();
  await ensureInsightsTable();
  await ensureCreativesTable();
  console.log('Meta Ads BigQuery tables initialized.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}
