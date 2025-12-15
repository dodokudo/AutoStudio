import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { BigQuery, Dataset, Table, Job } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { LstepConfig, loadLstepConfig } from '@/lib/lstep/config';
import { transformLstepCsv } from '@/lib/lstep/csvTransform';
import { uploadFileToGcs } from '@/lib/lstep/gcs';
import { NormalizedLstepData } from '@/lib/lstep/types';
import { loadRawCsvToBigQuery } from '@/lib/lstep/rawCsvLoader';

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx src/scripts/ingestLocalCsv.ts <csv-path>');
    process.exit(1);
  }

  const config = loadLstepConfig();
  const storage = new Storage();
  const bigquery = new BigQuery({ projectId: config.projectId });

  const { snapshotDate, timestamp } = buildSnapshotMetadata(config.timeZone);

  console.log(`📄 CSVファイル: ${csvPath}`);
  console.log(`📅 スナップショット日付: ${snapshotDate}`);

  // Create workspace directory
  const workspaceDir = join(dirname(csvPath), `lstep_workspace_${timestamp}`);
  await fs.mkdir(workspaceDir, { recursive: true });

  try {
    // Upload raw CSV to GCS
    const rawObjectName = `${config.rawPrefix}/snapshot_date=${snapshotDate}/lstep_friends_${timestamp}.csv`;
    await uploadFileToGcs(storage, config.gcsBucket, csvPath, rawObjectName, 'text/csv');
    console.log(`✅ Raw CSV uploaded to gs://${config.gcsBucket}/${rawObjectName}`);

    // Transform CSV
    const rawBuffer = await fs.readFile(csvPath);
    const normalized = transformLstepCsv(rawBuffer, snapshotDate);

    console.log(`📊 変換結果:`);
    console.log(`  - user_core: ${normalized.userCore.length} rows`);
    console.log(`  - user_tags: ${normalized.userTags.length} rows`);
    console.log(`  - user_sources: ${normalized.userSources.length} rows`);
    console.log(`  - user_surveys: ${normalized.userSurveys.length} rows`);

    // Persist processed files
    const processedObjects = await persistProcessedFiles(
      storage,
      config,
      normalized,
      workspaceDir,
      snapshotDate,
      timestamp,
    );

    console.log('✅ GCSアップロード完了');

    // Ensure dataset and tables exist
    await ensureDatasetAndTables(bigquery, config.dataset, config.location);

    // Load into BigQuery
    console.log('BigQueryにロード中...');
    await loadIntoBigQuery(bigquery, config, processedObjects);

    // Load raw CSV to BigQuery
    console.log('Raw CSVをBigQueryにロード中...');
    await loadRawCsvToBigQuery(storage, bigquery, config, csvPath, snapshotDate);

    console.log('✅ Lstep CSV 取得とBigQueryロードが完了しました');
  } finally {
    // Cleanup workspace
    await fs.rm(workspaceDir, { recursive: true, force: true });
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
  const jobs = [
    { table: 'user_core', objectName: objects.userCore },
    { table: 'user_tags', objectName: objects.userTags },
    { table: 'user_sources', objectName: objects.userSources },
    { table: 'user_surveys', objectName: objects.userSurveys },
  ];

  for (const jobDef of jobs) {
    const uri = `gs://${config.gcsBucket}/${jobDef.objectName}`;
    console.log(`  - ${jobDef.table} をロード中... (${uri})`);
    try {
      const [job] = await bigquery.createJob({
        configuration: {
          load: {
            sourceUris: [uri],
            destinationTable: {
              projectId: config.projectId,
              datasetId: config.dataset,
              tableId: jobDef.table,
            },
            sourceFormat: 'NEWLINE_DELIMITED_JSON',
            writeDisposition: 'WRITE_APPEND',
            autodetect: false,
          },
        },
      });
      await waitForLoadJob(job as Job);
      console.log(`  ✅ ${jobDef.table} のロード完了`);
    } catch (error) {
      console.error(`  ❌ ${jobDef.table} のロード失敗:`, error);
      throw error;
    }
  }
}

async function waitForLoadJob(job: Job): Promise<void> {
  if (typeof job.promise === 'function') {
    await job.promise();
    return;
  }
  await job.getMetadata();
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
  { name: 'friend_added_at', type: 'STRING' },
  { name: 'blocked', type: 'BOOL' },
  { name: 'last_msg_at', type: 'STRING' },
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
