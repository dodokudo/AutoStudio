#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

// Load environment variables
dotenv.config({ path: '.env.local' });

const rawProjectId = process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID;
const PROJECT_ID = rawProjectId ? resolveProjectId(rawProjectId) : undefined;
const DATASET_ID = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';

async function ensureDataset() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);

  const [exists] = await dataset.exists();
  if (exists) {
    console.log(`Dataset ${DATASET_ID} already exists`);
    return;
  }

  console.log(`Creating dataset ${DATASET_ID}...`);
  await dataset.create({
    location: LOCATION,
    description: 'LSTEP LINE friend management data',
  });
  console.log(`Dataset ${DATASET_ID} created`);
}

async function createBroadcastMetricsTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('broadcast_metrics');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table broadcast_metrics already exists');
      return;
    }

    console.log('Creating table broadcast_metrics...');

    const schema = [
      { name: 'measured_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: '計測日時' },
      { name: 'broadcast_id', type: 'STRING', mode: 'REQUIRED', description: 'sendlogs URLから抽出した配信ID' },
      { name: 'broadcast_name', type: 'STRING', mode: 'NULLABLE', description: '配信名' },
      { name: 'sent_at', type: 'STRING', mode: 'NULLABLE', description: '配信日時文字列' },
      { name: 'delivery_count', type: 'INT64', mode: 'NULLABLE', description: '配信数' },
      { name: 'open_count', type: 'INT64', mode: 'NULLABLE', description: '開封数' },
      { name: 'open_rate', type: 'FLOAT64', mode: 'NULLABLE', description: '開封率（%）' },
      { name: 'elapsed_minutes', type: 'INT64', mode: 'NULLABLE', description: '配信からの経過分数' },
    ];

    await table.create({
      schema,
      description: 'Lステップ一斉配信の開封率メトリクス（時系列）',
      timePartitioning: {
        type: 'DAY',
        field: 'measured_at',
      },
      clustering: {
        fields: ['broadcast_id'],
      },
    });

    console.log('Table broadcast_metrics created');
  } catch (error) {
    console.error(`Failed to create table broadcast_metrics: ${error}`);
    throw error;
  }
}

async function createUrlClickMetricsTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('url_click_metrics');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table url_click_metrics already exists');
      return;
    }

    console.log('Creating table url_click_metrics...');

    const schema = [
      { name: 'measured_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: '計測日時' },
      { name: 'url_id', type: 'STRING', mode: 'REQUIRED', description: 'URL計測ID' },
      { name: 'url_name', type: 'STRING', mode: 'NULLABLE', description: 'URL計測名' },
      { name: 'total_clicks', type: 'INT64', mode: 'NULLABLE', description: '総クリック数' },
      { name: 'unique_visitors', type: 'INT64', mode: 'NULLABLE', description: 'ユニーク訪問者数' },
      { name: 'click_rate', type: 'FLOAT64', mode: 'NULLABLE', description: 'クリック率（%）' },
      { name: 'elapsed_minutes', type: 'INT64', mode: 'NULLABLE', description: '配信からの経過分数' },
    ];

    await table.create({
      schema,
      description: 'LステップURL計測のクリック数メトリクス（時系列）',
      timePartitioning: {
        type: 'DAY',
        field: 'measured_at',
      },
      clustering: {
        fields: ['url_id'],
      },
    });

    console.log('Table url_click_metrics created');
  } catch (error) {
    console.error(`Failed to create table url_click_metrics: ${error}`);
    throw error;
  }
}

async function createMeasurementScheduleTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('measurement_schedule');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table measurement_schedule already exists');
      return;
    }

    console.log('Creating table measurement_schedule...');

    const schema = [
      { name: 'id', type: 'STRING', mode: 'REQUIRED', description: 'スケジュールID' },
      { name: 'broadcast_id', type: 'STRING', mode: 'REQUIRED', description: '配信ID' },
      { name: 'broadcast_name', type: 'STRING', mode: 'NULLABLE', description: '配信名' },
      { name: 'sent_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: '配信日時' },
      { name: 'measure_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: '計測予定日時' },
      { name: 'elapsed_minutes', type: 'INT64', mode: 'REQUIRED', description: '配信からの経過分数' },
      { name: 'status', type: 'STRING', mode: 'REQUIRED', description: 'pending / completed / failed' },
      { name: 'completed_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: '計測完了日時' },
      { name: 'error_message', type: 'STRING', mode: 'NULLABLE', description: 'エラーメッセージ' },
    ];

    await table.create({
      schema,
      description: 'Lステップ配信メトリクスの計測スケジュール管理',
      timePartitioning: {
        type: 'DAY',
        field: 'measure_at',
      },
      clustering: {
        fields: ['broadcast_id', 'status'],
      },
    });

    console.log('Table measurement_schedule created');
  } catch (error) {
    console.error(`Failed to create table measurement_schedule: ${error}`);
    throw error;
  }
}

async function createLaunchRegistrationsTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('launch_registrations');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table launch_registrations already exists');
      return;
    }

    console.log('Creating table launch_registrations...');

    const schema = [
      { name: 'funnel_id', type: 'STRING', mode: 'REQUIRED' as const, description: 'ファネルID' },
      { name: 'label', type: 'STRING', mode: 'NULLABLE' as const, description: '表示ラベル' },
      { name: 'status', type: 'STRING', mode: 'NULLABLE' as const, description: 'active / archived' },
      { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const, description: '登録日時' },
    ];

    await table.create({
      schema,
      description: 'Launchタブに登録されたファネルの一覧',
    });

    console.log('Table launch_registrations created');
  } catch (error) {
    console.error(`Failed to create table launch_registrations: ${error}`);
    throw error;
  }
}

async function main() {
  try {
    console.log('Initializing Lstep message metrics BigQuery tables...');
    console.log(`Project: ${PROJECT_ID}`);
    console.log(`Dataset: ${DATASET_ID}`);
    console.log(`Location: ${LOCATION}`);
    console.log('');

    await ensureDataset();
    await createBroadcastMetricsTable();
    await createUrlClickMetricsTable();
    await createMeasurementScheduleTable();
    await createLaunchRegistrationsTable();

    console.log('');
    console.log('Lstep message metrics tables initialized.');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
