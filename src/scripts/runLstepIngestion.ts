import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BigQuery, Table, Dataset } from '@google-cloud/bigquery';
import type { Job } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { LstepConfig, loadLstepConfig } from '@/lib/lstep/config';
import { cleanupWorkspace, downloadLstepCsv } from '@/lib/lstep/downloader';
import { transformLstepCsv } from '@/lib/lstep/csvTransform';
import { sendAlertEmail } from '@/lib/lstep/emailNotify';
import { uploadFileToGcs } from '@/lib/lstep/gcs';
import { withRetries } from '@/lib/lstep/retry';
import {
  BigQueryLoadError,
  CookieExpiredError,
  DownloadFailedError,
  MissingStorageStateError,
  ProcessingFailedError,
} from '@/lib/lstep/errors';
import { NormalizedLstepData } from '@/lib/lstep/types';

async function main(): Promise<void> {
  const config = loadLstepConfig();
  const storage = new Storage();
  const bigquery = new BigQuery({ projectId: config.projectId });

  const { snapshotDate, timestamp } = buildSnapshotMetadata(config.timeZone);

  let workspaceDir: string | null = null;

  try {
    const downloadOutcome = await withRetries(
      async () => downloadLstepCsv(storage, config),
      {
        maxAttempts: config.retryDelaysMs.length + 1,
        delaysMs: config.retryDelaysMs,
        onRetry: async (error, attempt) => {
          console.warn(`CSVダウンロード ${attempt}回目で失敗:`, error);
        },
      },
    );

    workspaceDir = downloadOutcome.workspaceDir;

    await uploadFileToGcs(
      storage,
      config.gcsBucket,
      downloadOutcome.storageStatePath,
      config.storageStateObject,
      'application/json',
    );

    const rawObjectName = `${config.rawPrefix}/snapshot_date=${snapshotDate}/lstep_friends_${timestamp}.csv`;
    await uploadFileToGcs(
      storage,
      config.gcsBucket,
      downloadOutcome.csvPath,
      rawObjectName,
      'text/csv',
    );

    const rawBuffer = await fs.readFile(downloadOutcome.csvPath);
    const normalized = transformCsvWithGuard(rawBuffer, snapshotDate);

    const processedObjects = await persistProcessedFiles(
      storage,
      config,
      normalized,
      workspaceDir,
      snapshotDate,
      timestamp,
    );

    await ensureDatasetAndTables(bigquery, config.dataset, config.location);

    await loadIntoBigQuery(bigquery, config, processedObjects);

    console.log('Lstep CSV 取得とBigQueryロードが完了しました');
  } catch (error) {
    await handleFailure(error, config);
    throw error;
  } finally {
    if (workspaceDir) {
      await cleanupWorkspace(workspaceDir);
    }
  }
}

interface ProcessedObjectPaths {
  userCore: string;
  userTags: string;
  userSources: string;
  userSurveys: string;
}

async function persistProcessedFiles(
  storage: Storage,
  config: LstepConfig,
  data: NormalizedLstepData,
  workspaceDir: string,
  snapshotDate: string,
  timestamp: string,
): Promise<ProcessedObjectPaths> {
  const processedDir = join(workspaceDir, 'processed');
  await fs.mkdir(processedDir, { recursive: true });

  const fileDefs: Array<{ key: keyof ProcessedObjectPaths; table: string; rows: unknown[] }> = [
    { key: 'userCore', table: 'user_core', rows: data.userCore },
    { key: 'userTags', table: 'user_tags', rows: data.userTags },
    { key: 'userSources', table: 'user_sources', rows: data.userSources },
    { key: 'userSurveys', table: 'user_surveys', rows: data.userSurveys },
  ];

  const results: Partial<ProcessedObjectPaths> = {};

  for (const { key, table, rows } of fileDefs) {
    const localPath = join(processedDir, `${table}.jsonl`);
    await writeJsonLines(localPath, rows);

    const objectName = `${config.processedPrefix}/${table}/snapshot_date=${snapshotDate}/${table}_${timestamp}.jsonl`;
    await uploadFileToGcs(storage, config.gcsBucket, localPath, objectName, 'application/json');

    results[key] = objectName;
  }

  return results as ProcessedObjectPaths;
}

async function writeJsonLines(filePath: string, rows: unknown[]): Promise<void> {
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf8');
}

function transformCsvWithGuard(buffer: Buffer, snapshotDate: string): NormalizedLstepData {
  try {
    return transformLstepCsv(buffer, snapshotDate);
  } catch (error) {
    throw new ProcessingFailedError('CSV整形中にエラーが発生しました', { cause: error });
  }
}

async function ensureDatasetAndTables(bigquery: BigQuery, datasetId: string, location: string): Promise<void> {
  const dataset = await ensureDataset(bigquery, datasetId, location);

  await ensureTable(dataset, 'user_core', USER_CORE_SCHEMA, 'snapshot_date', ['user_id']);
  await ensureTable(dataset, 'user_tags', USER_TAGS_SCHEMA, 'snapshot_date', ['user_id', 'tag_name']);
  await ensureTable(dataset, 'user_sources', USER_SOURCES_SCHEMA, 'snapshot_date', ['user_id', 'source_name']);
  await ensureTable(dataset, 'user_surveys', USER_SURVEYS_SCHEMA, 'snapshot_date', ['user_id', 'question']);
}

async function ensureDataset(bigquery: BigQuery, datasetId: string, location: string): Promise<Dataset> {
  const dataset = bigquery.dataset(datasetId);
  const [exists] = await dataset.exists();
  if (!exists) {
    await bigquery.createDataset(datasetId, { location });
  }
  return dataset;
}

async function ensureTable(
  dataset: Dataset,
  tableId: string,
  schema: SchemaField[],
  partitionField: string,
  clusteringFields: string[],
): Promise<Table> {
  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: { fields: schema },
      timePartitioning: {
        type: 'DAY',
        field: partitionField,
      },
      clustering: clusteringFields.length > 0 ? { fields: clusteringFields } : undefined,
    });
  }
  return table;
}

async function loadIntoBigQuery(
  bigquery: BigQuery,
  config: LstepConfig,
  objects: ProcessedObjectPaths,
): Promise<void> {
  const dataset = bigquery.dataset(config.dataset);

  const jobs = [
    { table: 'user_core', objectName: objects.userCore },
    { table: 'user_tags', objectName: objects.userTags },
    { table: 'user_sources', objectName: objects.userSources },
    { table: 'user_surveys', objectName: objects.userSurveys },
  ];

  for (const jobDef of jobs) {
    const table = dataset.table(jobDef.table);
    const uri = `gs://${config.gcsBucket}/${jobDef.objectName}`;
    try {
      const [job] = await table.load(uri, {
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: 'WRITE_APPEND',
      });
      await waitForLoadJob(job as Job);
    } catch (error) {
      throw new BigQueryLoadError(`${jobDef.table} テーブルへのロードに失敗しました`, { cause: error });
    }
  }
}

async function waitForLoadJob(job: Job): Promise<void> {
  if (typeof job.promise === 'function') {
    await job.promise();
    return;
  }

  // promise が型定義に存在しない環境向けのフォールバック
  await job.getMetadata();
}

async function handleFailure(error: unknown, config: LstepConfig): Promise<void> {
  if (error instanceof CookieExpiredError || error instanceof MissingStorageStateError) {
    await sendSafeAlert(config, 'Cookie失効', buildCookieExpiredBody());
    return;
  }

  if (error instanceof DownloadFailedError) {
    await sendSafeAlert(config, 'CSVダウンロード失敗', 'CSVダウンロードが3回のリトライ後も失敗しました。Cloud Run ログを確認してください。');
    return;
  }

  if (error instanceof ProcessingFailedError) {
    await sendSafeAlert(config, 'CSV整形エラー', 'CSV 整形処理でエラーが発生しました。Cloud Run の実行ログを確認してください。');
    return;
  }

  if (error instanceof BigQueryLoadError) {
    await sendSafeAlert(config, 'BigQueryロード失敗', 'BigQuery へのロードに失敗しました。ジョブログを確認してください。');
    return;
  }

  await sendSafeAlert(config, '想定外のエラー', '想定外のエラーが発生しました。Cloud Run ログを確認してください。');
}

async function sendSafeAlert(config: LstepConfig, subjectSuffix: string, body: string): Promise<void> {
  const subject = `${config.emailSubjectPrefix} ${subjectSuffix}`;
  const fullBody = `${body}\n\n再ログイン手順:\n1. npm run lstep:capture\n2. 表示されたブラウザでLstepにログイン（reCAPTCHA対応）\n3. コンソールに保存完了ログが出たら終了\n4. Cloud Run ジョブを再実行、または次回スケジュールを待つ\n`;

  try {
    await sendAlertEmail(config, {
      subject,
      body: fullBody,
    });
  } catch (notifyError) {
    console.error('アラートメールの送信に失敗しました', notifyError);
  }
}

function buildCookieExpiredBody(): string {
  return [
    'LstepのCookieが失効しました。再ログインが必要です。',
    '手順:',
    '  - ターミナルで npm run lstep:capture を実行',
    '  - 開いたブラウザから dodo.inc0 / a768768a でログイン（reCAPTCHA手動対応）',
    '  - 保存完了後、次回バッチで自動ダウンロードが復旧します',
  ].join('\n');
}

interface SnapshotMetadata {
  snapshotDate: string;
  timestamp: string;
}

function buildSnapshotMetadata(timeZone: string): SnapshotMetadata {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const date = dateFormatter.format(now);
  const time = timeFormatter.format(now).replace(/:/g, '');

  return {
    snapshotDate: date,
    timestamp: `${date.replace(/-/g, '')}_${time}`,
  };
}

type SchemaField = {
  name: string;
  type: string;
  mode?: 'NULLABLE' | 'REQUIRED' | 'REPEATED';
};

const USER_CORE_SCHEMA: SchemaField[] = [
  { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'display_name', type: 'STRING' },
  { name: 'friend_added_at', type: 'DATETIME' },
  { name: 'blocked', type: 'BOOL' },
  { name: 'last_msg_at', type: 'DATETIME' },
  { name: 'scenario_name', type: 'STRING' },
  { name: 'scenario_days', type: 'INT64' },
];

const USER_TAGS_SCHEMA: SchemaField[] = [
  { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'tag_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'tag_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'tag_flag', type: 'INT64', mode: 'REQUIRED' },
];

const USER_SOURCES_SCHEMA: SchemaField[] = [
  { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'source_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'source_flag', type: 'INT64', mode: 'REQUIRED' },
];

const USER_SURVEYS_SCHEMA: SchemaField[] = [
  { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'question', type: 'STRING', mode: 'REQUIRED' },
  { name: 'answer_flag', type: 'INT64', mode: 'REQUIRED' },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
