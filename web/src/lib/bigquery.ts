import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'autostudio_threads';

export function createBigQueryClient(projectId: string) {
  return new BigQuery({
    projectId,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
}

export function getDataset(client: BigQuery) {
  return client.dataset(DATASET_ID);
}
