import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'autostudio_threads';

function loadCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
      console.warn('[bigquery] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON', error);
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.info('[bigquery] Using GOOGLE_APPLICATION_CREDENTIALS path for credentials');
  }
  return undefined;
}

export function createBigQueryClient(projectId: string) {
  const credentials = loadCredentials();
  return new BigQuery({
    projectId,
    credentials,
    keyFilename: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
}

export function getDataset(client: BigQuery) {
  return client.dataset(DATASET_ID);
}
