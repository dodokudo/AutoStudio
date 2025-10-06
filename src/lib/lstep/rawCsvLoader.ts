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

  const dataLines = lines.slice(2).filter((line) => line.trim() !== '');
  const friendAddedIndex = headers.findIndex((h) => normalizeColumnName(h) === 'friend_added_at');
  const lastMsgIndex = headers.findIndex((h) => normalizeColumnName(h) === 'last_msg_at');

  const normalizedLines = [
    normalizedHeaders.map((h) => `"${h}"`).join(','),
    ...dataLines.map((line) => {
      const values = parseCSVLine(line);

      if (friendAddedIndex >= 0 && values[friendAddedIndex]) {
        values[friendAddedIndex] = convertUTCtoJST(values[friendAddedIndex]);
      }

      if (lastMsgIndex >= 0 && values[lastMsgIndex]) {
        values[lastMsgIndex] = convertUTCtoJST(values[lastMsgIndex]);
      }

      const escapedValues = values.map((value) => `"${value.replace(/"/g, '""')}"`);
      return `"${snapshotDate}",${escapedValues.join(',')}`;
    }),
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
        writeDisposition: 'WRITE_TRUNCATE', // 既存データを削除してから挿入（重複防止）
        autodetect: true,
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.replace(/\r$/, ''));
}

function normalizeColumnName(name: string): string {
  // 日本語と特殊文字を英数字とアンダースコアに変換
  // 特殊なパターンを先に処理（長い→短い順）
  const normalized = name
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

function convertUTCtoJST(utcTimestamp: string): string {
  const trimmed = utcTimestamp?.trim();
  if (!trimmed) {
    return '';
  }

  const candidates = [trimmed, trimmed.replace(/\s*UTC$/i, '').trim()];
  let date: Date | null = null;

  for (const candidate of candidates) {
    const isoLike = candidate.includes('T') ? candidate : candidate.replace(' ', 'T');
    const withZone = /[zZ]$/.test(isoLike) ? isoLike : `${isoLike.replace(/\s*UTC$/i, '')}Z`;
    const parsed = new Date(withZone);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
      break;
    }
  }

  if (!date) {
    console.warn('[rawCsvLoader] Failed to parse UTC timestamp:', utcTimestamp);
    return trimmed;
  }

  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  const normalized = formatted.replace(/[\u202f\u00a0]/g, ' ');
  const iso = normalized.replace(' ', 'T');
  return `${iso}+09:00`;
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
