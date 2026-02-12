/**
 * 自動コメント履歴テーブルを作成するスクリプト
 */

import { createBigQueryClient, resolveProjectId, getDataset } from '../src/lib/bigquery';
import { TableField } from '@google-cloud/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET_ID = 'autostudio_threads';
const TABLE_ID = 'auto_comment_history';

async function main() {
  console.log(`Creating table: ${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}`);

  const client = createBigQueryClient(PROJECT_ID);
  const dataset = getDataset(client, DATASET_ID);
  const table = dataset.table(TABLE_ID);

  const [exists] = await table.exists();

  if (exists) {
    console.log('Table already exists. Skipping creation.');
    return;
  }

  const schema: TableField[] = [
    { name: 'post_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'triggered_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'trigger_reason', type: 'STRING', mode: 'REQUIRED' }, // 'impressions' or 'comment_ctr'
    { name: 'impressions', type: 'INT64', mode: 'REQUIRED' },
    { name: 'comment1_ctr', type: 'FLOAT64', mode: 'NULLABLE' },
    { name: 'has_tokuten_guide', type: 'BOOL', mode: 'REQUIRED' },
    { name: 'tokuten_comment_added', type: 'BOOL', mode: 'REQUIRED' },
    { name: 'note_article_url', type: 'STRING', mode: 'NULLABLE' },
    { name: 'note_comment_added', type: 'BOOL', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ];

  await table.create({ schema });

  console.log('Table created successfully!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
