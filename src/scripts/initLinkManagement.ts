import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'mark-454114';
const dataset = 'autostudio_links';
const location = 'asia-northeast1';

const bigquery = new BigQuery({ projectId });

async function main() {
  console.log('リンク管理用BigQueryテーブルを初期化します...');

  // データセット作成
  const [datasets] = await bigquery.getDatasets();
  const datasetExists = datasets.some((ds) => ds.id === dataset);

  if (!datasetExists) {
    console.log(`データセット ${dataset} を作成中...`);
    await bigquery.createDataset(dataset, { location });
    console.log(`✓ データセット ${dataset} を作成しました`);
  } else {
    console.log(`✓ データセット ${dataset} は既に存在します`);
  }

  const datasetRef = bigquery.dataset(dataset);

  // 短縮URLテーブル
  const shortLinksTable = datasetRef.table('short_links');
  const [shortLinksExists] = await shortLinksTable.exists();

  if (!shortLinksExists) {
    console.log('短縮URLテーブルを作成中...');
    await shortLinksTable.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'short_code', type: 'STRING', mode: 'REQUIRED' },
          { name: 'destination_url', type: 'STRING', mode: 'REQUIRED' },
          { name: 'title', type: 'STRING', mode: 'NULLABLE' },
          { name: 'description', type: 'STRING', mode: 'NULLABLE' },
          { name: 'ogp_image_url', type: 'STRING', mode: 'NULLABLE' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'created_by', type: 'STRING', mode: 'NULLABLE' },
          { name: 'is_active', type: 'BOOLEAN', mode: 'REQUIRED' },
        ],
      },
    });
    console.log('✓ 短縮URLテーブルを作成しました');
  } else {
    console.log('✓ 短縮URLテーブルは既に存在します');
  }

  // クリックログテーブル
  const clickLogsTable = datasetRef.table('click_logs');
  const [clickLogsExists] = await clickLogsTable.exists();

  if (!clickLogsExists) {
    console.log('クリックログテーブルを作成中...');
    await clickLogsTable.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'short_link_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'clicked_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'referrer', type: 'STRING', mode: 'NULLABLE' },
          { name: 'user_agent', type: 'STRING', mode: 'NULLABLE' },
          { name: 'ip_address', type: 'STRING', mode: 'NULLABLE' },
          { name: 'country', type: 'STRING', mode: 'NULLABLE' },
          { name: 'device_type', type: 'STRING', mode: 'NULLABLE' },
        ],
      },
      timePartitioning: {
        type: 'DAY',
        field: 'clicked_at',
      },
    });
    console.log('✓ クリックログテーブルを作成しました');
  } else {
    console.log('✓ クリックログテーブルは既に存在します');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('リンク管理システムの初期化が完了しました！');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('エラーが発生しました:', error);
  process.exitCode = 1;
});
