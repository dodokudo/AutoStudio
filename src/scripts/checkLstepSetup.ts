import 'dotenv/config';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { loadLstepConfig } from '@/lib/lstep/config';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  hint?: string;
}

async function main(): Promise<void> {
  const config = loadLstepConfig();
  const storage = new Storage();
  const bigquery = new BigQuery({ projectId: config.projectId });

  const results: CheckResult[] = [];

  results.push({
    name: 'Configuration',
    status: 'pass',
    message: formatConfigSummary(config.projectId, config.dataset, config.location),
  });

  results.push(await checkGcsBucket(storage, config.gcsBucket));
  results.push(await checkStorageState(storage, config.gcsBucket, config.storageStateObject));
  results.push(await checkBigQueryDataset(bigquery, config.dataset));
  results.push(await checkBigQueryTables(bigquery, config.dataset));
  results.push(await checkBigQueryQuery(bigquery));

  printResults(results);

  const hasFailure = results.some((result) => result.status === 'fail');
  if (hasFailure) {
    process.exitCode = 1;
  }
}

function formatConfigSummary(projectId: string, dataset: string, location: string): string {
  return `project=${projectId}, dataset=${dataset}, location=${location}`;
}

async function checkGcsBucket(storage: Storage, bucketName: string): Promise<CheckResult> {
  try {
    const [exists] = await storage.bucket(bucketName).exists();
    if (!exists) {
      return {
        name: 'GCS bucket',
        status: 'fail',
        message: `Bucket ${bucketName} not found or access denied`,
        hint: '確認: LSTEP_GCS_BUCKET とサービスアカウント権限 (Storage Object Admin)。',
      };
    }
    return {
      name: 'GCS bucket',
      status: 'pass',
      message: `Bucket ${bucketName} is accessible`,
    };
  } catch (error) {
    return {
      name: 'GCS bucket',
      status: 'fail',
      message: `Failed to query bucket ${bucketName}: ${(error as Error).message}`,
      hint: 'gcloud auth・サービスアカウント鍵を再確認してください。',
    };
  }
}

async function checkStorageState(
  storage: Storage,
  bucketName: string,
  storageStateObject: string,
): Promise<CheckResult> {
  try {
    const [exists] = await storage.bucket(bucketName).file(storageStateObject).exists();
    if (!exists) {
      return {
        name: 'Storage state',
        status: 'warn',
        message: `Cookie state ${storageStateObject} is missing`,
        hint: '初回は npm run lstep:capture でログイン情報を保存します。',
      };
    }
    return {
      name: 'Storage state',
      status: 'pass',
      message: `Cookie state found at gs://${bucketName}/${storageStateObject}`,
    };
  } catch (error) {
    return {
      name: 'Storage state',
      status: 'fail',
      message: `Unable to inspect cookie object: ${(error as Error).message}`,
      hint: 'GCS の権限とオブジェクトパスを確認してください。',
    };
  }
}

async function checkBigQueryDataset(bigquery: BigQuery, datasetId: string): Promise<CheckResult> {
  try {
    const dataset = bigquery.dataset(datasetId);
    const [exists] = await dataset.exists();
    if (!exists) {
      return {
        name: 'BigQuery dataset',
        status: 'warn',
        message: `Dataset ${datasetId} does not exist`,
        hint: 'npm run lstep:init を実行して初期セットアップを行ってください。',
      };
    }

    const [metadata] = await dataset.getMetadata();

    return {
      name: 'BigQuery dataset',
      status: 'pass',
      message: `Dataset ${datasetId} is available (${metadata.location ?? 'location unknown'})`,
    };
  } catch (error) {
    return {
      name: 'BigQuery dataset',
      status: 'fail',
      message: `Failed to inspect dataset ${datasetId}: ${(error as Error).message}`,
      hint: 'サービスアカウントに BigQuery Data Editor 権限があるか確認してください。',
    };
  }
}

async function checkBigQueryTables(bigquery: BigQuery, datasetId: string): Promise<CheckResult> {
  const requiredTables = ['user_core', 'user_tags', 'user_sources', 'user_surveys'];
  const missing: string[] = [];

  try {
    const dataset = bigquery.dataset(datasetId);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      return {
        name: 'BigQuery tables',
        status: 'warn',
        message: `Dataset ${datasetId} does not exist`,
        hint: '先に npm run lstep:init を実行してデータセットを作成してください。',
      };
    }

    for (const tableId of requiredTables) {
      const table = dataset.table(tableId);
      const [exists] = await table.exists();
      if (!exists) {
        missing.push(tableId);
      }
    }

    if (missing.length > 0) {
      return {
        name: 'BigQuery tables',
        status: 'warn',
        message: `Missing tables: ${missing.join(', ')}`,
        hint: 'npm run lstep:init で必要なテーブルを自動作成できます。',
      };
    }

    return {
      name: 'BigQuery tables',
      status: 'pass',
      message: 'Required tables are present',
    };
  } catch (error) {
    return {
      name: 'BigQuery tables',
      status: 'fail',
      message: `Failed to verify tables: ${(error as Error).message}`,
      hint: 'BigQuery権限とデータセットの存在を確認してください。',
    };
  }
}

async function checkBigQueryQuery(bigquery: BigQuery): Promise<CheckResult> {
  try {
    const [rows] = await bigquery.query({ query: 'SELECT 1 AS ok', useLegacySql: false });
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        name: 'BigQuery query',
        status: 'warn',
        message: 'Query returned no rows',
      };
    }
    return {
      name: 'BigQuery query',
      status: 'pass',
      message: 'Query execution succeeded',
    };
  } catch (error) {
    return {
      name: 'BigQuery query',
      status: 'fail',
      message: `Failed to execute test query: ${(error as Error).message}`,
      hint: 'BigQuery API の有効化とクレデンシャルを確認してください。',
    };
  }
}

function printResults(results: CheckResult[]): void {
  for (const result of results) {
    const label = formatStatusLabel(result.status);
    console.log(`${label} ${result.name}: ${result.message}`);
    if (result.hint && result.status !== 'pass') {
      console.log(`    hint: ${result.hint}`);
    }
  }
}

function formatStatusLabel(status: CheckStatus): string {
  switch (status) {
    case 'pass':
      return '[PASS]';
    case 'warn':
      return '[WARN]';
    case 'fail':
      return '[FAIL]';
    default:
      return '[----]';
  }
}

main().catch((error) => {
  console.error('[FAIL] Unexpected error during Lstep setup check', error);
  process.exitCode = 1;
});
