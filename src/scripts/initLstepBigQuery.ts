#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

// Load environment variables
dotenv.config({ path: '.env.local' });

const rawProjectId = process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID;
const PROJECT_ID = rawProjectId ? resolveProjectId(rawProjectId) : undefined;
const DATASET_ID = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const LOCATION = process.env.LSTEP_BQ_LOCATION || 'asia-northeast1';

async function createDatasetIfNotExists() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);

  try {
    const [exists] = await dataset.exists();
    if (exists) {
      console.log(`Dataset ${DATASET_ID} already exists`);
      return;
    }

    console.log(`Creating dataset ${DATASET_ID}...`);
    await dataset.create({
      location: LOCATION,
      description: 'LSTEP LINE friend management data'
    });
    console.log(`✅ Dataset ${DATASET_ID} created successfully`);
  } catch (error) {
    console.error(`❌ Failed to create dataset: ${error}`);
    throw error;
  }
}

async function createUserCoreTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('user_core');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table user_core already exists');
      return;
    }

    console.log('Creating table user_core...');

    const schema = [
      { name: 'user_id', type: 'STRING', mode: 'REQUIRED', description: '登録ID' },
      { name: 'display_name', type: 'STRING', mode: 'NULLABLE', description: '表示名' },
      { name: 'added_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: '友だち追加日時' },
      { name: 'is_blocked', type: 'BOOLEAN', mode: 'NULLABLE', description: 'ユーザーブロック' },
      { name: 'last_message_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: '最終メッセージ日時' },
      { name: 'active_scenario', type: 'STRING', mode: 'NULLABLE', description: '購読中シナリオ' },
      { name: 'scenario_days', type: 'STRING', mode: 'NULLABLE', description: 'シナリオ日数' },
      { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED', description: 'スナップショット取得日' },
      { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'レコード作成日時' },
    ];

    await table.create({
      schema: schema,
      description: 'LSTEP LINE friend core data',
      timePartitioning: {
        type: 'DAY',
        field: 'snapshot_date'
      }
    });

    console.log('✅ Table user_core created successfully');
  } catch (error) {
    console.error(`❌ Failed to create table user_core: ${error}`);
    throw error;
  }
}

async function createUserTagsTable() {
  if (!PROJECT_ID) {
    throw new Error('Project ID is required');
  }

  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET_ID);
  const table = dataset.table('user_tags');

  try {
    const [exists] = await table.exists();
    if (exists) {
      console.log('Table user_tags already exists');
      return;
    }

    console.log('Creating table user_tags...');

    const schema = [
      { name: 'user_id', type: 'STRING', mode: 'REQUIRED', description: '登録ID' },
      { name: 'tag_id', type: 'STRING', mode: 'REQUIRED', description: 'タグID' },
      { name: 'tag_name', type: 'STRING', mode: 'REQUIRED', description: 'タグ名' },
      { name: 'has_tag', type: 'BOOLEAN', mode: 'REQUIRED', description: 'タグ保有フラグ' },
      { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED', description: 'スナップショット取得日' },
      { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'レコード作成日時' },
    ];

    await table.create({
      schema: schema,
      description: 'LSTEP user tag associations',
      timePartitioning: {
        type: 'DAY',
        field: 'snapshot_date'
      }
    });

    console.log('✅ Table user_tags created successfully');
  } catch (error) {
    console.error(`❌ Failed to create table user_tags: ${error}`);
    throw error;
  }
}

async function main() {
  try {
    console.log(`🚀 Initializing LSTEP BigQuery setup...`);
    console.log(`Project: ${PROJECT_ID}`);
    console.log(`Dataset: ${DATASET_ID}`);
    console.log(`Location: ${LOCATION}`);
    console.log('');

    await createDatasetIfNotExists();
    await createUserCoreTable();
    await createUserTagsTable();

    console.log('');
    console.log('🎉 LSTEP BigQuery setup completed successfully!');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
