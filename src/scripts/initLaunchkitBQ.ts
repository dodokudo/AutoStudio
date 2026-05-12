#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

dotenv.config({ path: '.env.local' });

const rawProjectId = process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.BQ_PROJECT_ID;
const PROJECT_ID = rawProjectId ? resolveProjectId(rawProjectId) : undefined;
const DATASET_ID = 'autostudio_links';
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';

async function ensureDataset() {
  if (!PROJECT_ID) throw new Error('Project ID is required');

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);

  const [exists] = await dataset.exists();
  if (exists) {
    console.log(`Dataset ${DATASET_ID} already exists`);
    return;
  }

  console.log(`Creating dataset ${DATASET_ID}...`);
  await dataset.create({ location: LOCATION, description: 'AutoStudio link tracking + LaunchKit LP measurement' });
  console.log(`Dataset ${DATASET_ID} created`);
}

async function createLaunchkitLpsTable() {
  if (!PROJECT_ID) throw new Error('Project ID is required');

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('launchkit_lps');

  const [exists] = await table.exists();
  if (exists) {
    console.log('Table launchkit_lps already exists');
    return;
  }

  console.log('Creating table launchkit_lps...');

  const schema = [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' as const, description: 'LP UUID' },
    { name: 'name', type: 'STRING', mode: 'REQUIRED' as const, description: 'LP表示名' },
    { name: 'slug', type: 'STRING', mode: 'REQUIRED' as const, description: 'LaunchKit slug' },
    { name: 'url', type: 'STRING', mode: 'REQUIRED' as const, description: 'LP公開URL' },
    { name: 'genre', type: 'STRING', mode: 'NULLABLE' as const, description: 'opt / seminar / consult / other' },
    { name: 'source', type: 'STRING', mode: 'NULLABLE' as const, description: 'threads / instagram / ad / note / youtube / other' },
    { name: 'line_cta_url', type: 'STRING', mode: 'NULLABLE' as const, description: 'LステップCTA直リンク' },
    { name: 'is_active', type: 'BOOL', mode: 'REQUIRED' as const, description: '有効状態' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
    { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
  ];

  await table.create({
    schema,
    description: 'LaunchKit LP管理テーブル',
  });

  console.log('Table launchkit_lps created');
}

async function createLaunchkitEventsTable() {
  if (!PROJECT_ID) throw new Error('Project ID is required');

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('launchkit_events');

  const [exists] = await table.exists();
  if (exists) {
    console.log('Table launchkit_events already exists');
    return;
  }

  console.log('Creating table launchkit_events...');

  const schema = [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' as const, description: 'event UUID' },
    { name: 'lp_id', type: 'STRING', mode: 'REQUIRED' as const, description: 'launchkit_lps.id' },
    { name: 'event_type', type: 'STRING', mode: 'REQUIRED' as const, description: 'page_view / line_cta_click' },
    { name: 'occurred_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const, description: '発生日時' },
    { name: 'referrer', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'user_agent', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'ip_address', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'device_type', type: 'STRING', mode: 'NULLABLE' as const, description: 'Mobile / Tablet / Desktop' },
    { name: 'url', type: 'STRING', mode: 'NULLABLE' as const, description: '発生ページURL' },
    { name: 'source', type: 'STRING', mode: 'NULLABLE' as const, description: 'LP定義からコピー' },
    { name: 'genre', type: 'STRING', mode: 'NULLABLE' as const, description: 'LP定義からコピー' },
    { name: 'utm_source', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'utm_medium', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'utm_campaign', type: 'STRING', mode: 'NULLABLE' as const },
    { name: 'fbclid', type: 'STRING', mode: 'NULLABLE' as const },
  ];

  await table.create({
    schema,
    description: 'LaunchKit LP閲覧・CTAクリックのイベントログ',
    timePartitioning: { type: 'DAY', field: 'occurred_at' },
    clustering: { fields: ['lp_id', 'event_type'] },
  });

  console.log('Table launchkit_events created');
}

async function main() {
  try {
    console.log('Initializing LaunchKit BigQuery tables...');
    console.log(`Project: ${PROJECT_ID}`);
    console.log(`Dataset: ${DATASET_ID}`);
    console.log(`Location: ${LOCATION}`);
    console.log('');

    await ensureDataset();
    await createLaunchkitLpsTable();
    await createLaunchkitEventsTable();

    console.log('');
    console.log('LaunchKit BigQuery tables initialized.');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
