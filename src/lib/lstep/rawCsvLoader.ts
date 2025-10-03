import { promises as fs } from 'node:fs';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import iconv from 'iconv-lite';

interface RawCsvLoaderConfig {
  projectId: string;
  dataset: string;
  gcsBucket: string;
  location: string;
}

/**
 * CSVをそのままBigQueryにロードする（列構造を保持）
 */
export async function loadRawCsvToBigQuery(
  storage: Storage,
  bigquery: BigQuery,
  config: RawCsvLoaderConfig,
  csvPath: string,
  snapshotDate: string,
): Promise<void> {
  // 1. CSVをShift_JISからUTF-8に変換
  const csvBuffer = await fs.readFile(csvPath);
  const utf8Content = iconv.decode(csvBuffer, 'shift_jis');

  // 2. ヘッダー行を取得して英語カラム名にマッピング
  const lines = utf8Content.split('\n');
  const headerLine = lines[1]; // 2行目がヘッダー（1行目は登録ID行）
  const headers = parseCSVLine(headerLine);

  // 3. snapshot_date列を追加したヘッダーを作成
  const normalizedHeaders = ['snapshot_date', ...headers.map(normalizeColumnName)];

  // 4. データ行にsnapshot_dateを追加
  const dataLines = lines.slice(2).filter((line) => line.trim() !== '');
  const normalizedLines = [
    normalizedHeaders.map((h) => `"${h}"`).join(','),
    ...dataLines.map((line) => `"${snapshotDate}",${line}`),
  ].join('\n');

  // 5. 正規化したCSVをGCSにアップロード
  const tempCsvPath = csvPath.replace('.csv', '_normalized.csv');
  await fs.writeFile(tempCsvPath, normalizedLines, 'utf8');

  const gcsObjectName = `lstep/raw_normalized/snapshot_date=${snapshotDate}/lstep_friends_${Date.now()}.csv`;
  await uploadFileToGcs(storage, config.gcsBucket, tempCsvPath, gcsObjectName);

  // 6. BigQueryテーブルを作成（存在しない場合）
  const dataset = bigquery.dataset(config.dataset);
  const table = dataset.table('lstep_friends_raw');
  const [exists] = await table.exists();

  if (!exists) {
    // 初回はパーティションなしでテーブル作成（autodetectでスキーマを自動作成）
    console.log('テーブル lstep_friends_raw を作成中...');
  }

  // 7. BigQueryにロード
  const gcsUri = `gs://${config.gcsBucket}/${gcsObjectName}`;
  console.log(`BigQueryにロード中: ${gcsUri}`);

  const [job] = await bigquery.createJob({
    configuration: {
      load: {
        sourceUris: [gcsUri],
        destinationTable: {
          projectId: config.projectId,
          datasetId: config.dataset,
          tableId: 'lstep_friends_raw',
        },
        sourceFormat: 'CSV',
        skipLeadingRows: 1,
        writeDisposition: 'WRITE_APPEND',
        autodetect: true,
        schemaUpdateOptions: exists ? ['ALLOW_FIELD_ADDITION', 'ALLOW_FIELD_RELAXATION'] : undefined, // 新しい列を自動追加
      },
    },
  });

  await job.promise();
  console.log('✅ Raw CSVのBigQueryロードが完了しました');

  // 8. 一時ファイルを削除
  await fs.unlink(tempCsvPath);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function normalizeColumnName(name: string): string {
  // 日本語と特殊文字を英数字とアンダースコアに変換
  // 特殊なパターンを先に処理（長い→短い順）
  let normalized = name
    .replace(/流入経路：Threads　固定/g, 'source_threads_fixed')
    .replace(/流入経路：Threads　ポスト/g, 'source_threads_post')
    .replace(/流入経路：Threads　プロフ/g, 'source_threads_profile')
    .replace(/流入経路：Threads/g, 'source_threads')
    .replace(/流入経路：Instagram/g, 'source_instagram')
    .replace(/流入媒体：OG/g, 'inflow_organic')
    .replace(/アンケート：フォーム流入/g, 'survey_form_inflow')
    .replace(/ID/g, 'id')
    .replace(/表示名/g, 'display_name')
    .replace(/友だち追加日時/g, 'friend_added_at')
    .replace(/ユーザーブロック/g, 'blocked')
    .replace(/最終メッセージ日時/g, 'last_msg_at')
    .replace(/購読中シナリオ/g, 'scenario_name')
    .replace(/シナリオ日数/g, 'scenario_days')
    .replace(/流入経路：/g, 'source_')
    .replace(/アンケート：/g, 'survey_')
    .replace(/目標：/g, 'goal_')
    .replace(/売上：/g, 'revenue_')
    .replace(/職業：/g, 'job_')
    .replace(/IG×LN：/g, 'igln_')
    .replace(/[：、。！？「」『』（）\s　]/g, '_')
    .replace(/月/g, 'm')
    .replace(/万円/g, 'man')
    .replace(/以上/g, 'over')
    .replace(/から/g, 'to')
    .replace(/円/g, 'yen')
    .replace(/代/g, 's')
    .replace(/ポスト/g, 'post')
    .replace(/プロフ/g, 'profile')
    .replace(/回答完了/g, 'completed')
    .replace(/学生/g, 'student')
    .replace(/会社員/g, 'employee')
    .replace(/主婦/g, 'housewife')
    .replace(/フリーランス/g, 'freelance')
    .replace(/経営者/g, 'business_owner')
    .replace(/流入/g, 'inflow')
    .replace(/済/g, 'done')
    .replace(/閲覧P/g, 'view_page')
    .replace(/動画視聴/g, 'video_watched')
    .replace(/S申込P/g, 's_apply_page')
    .replace(/S申込/g, 's_applied')
    .replace(/S参加/g, 's_joined')
    .replace(/S特典/g, 's_bonus')
    .replace(/個別配信移行/g, 'personal_msg')
    .replace(/個別P/g, 'personal_page')
    .replace(/個別申込/g, 'personal_applied')
    .replace(/詳細F/g, 'detail_finished')
    .replace(/個別/g, 'personal')
    .replace(/成約/g, 'contracted')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  return normalized;
}

async function uploadFileToGcs(
  storage: Storage,
  bucketName: string,
  localPath: string,
  objectName: string,
): Promise<void> {
  await storage.bucket(bucketName).upload(localPath, {
    destination: objectName,
  });
}
