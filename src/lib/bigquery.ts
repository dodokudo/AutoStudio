import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'autostudio_threads';

function loadCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (rawJson) {
    try {
      const maybeBase64 = rawJson.trim();
      const jsonString = maybeBase64.startsWith('{')
        ? maybeBase64
        : Buffer.from(maybeBase64, 'base64').toString('utf8');

      const credentials = JSON.parse(jsonString);

      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      return credentials;
    } catch (error) {
      console.warn('[bigquery] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON', error);
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.info('[bigquery] Using GOOGLE_APPLICATION_CREDENTIALS path for credentials');
  }

  return undefined;
}

export function createBigQueryClient(projectId: string, location?: string) {
  const credentials = loadCredentials();
  return new BigQuery({
    projectId,
    credentials,
    keyFilename: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    location: location || process.env.LSTEP_BQ_LOCATION || 'US',
  });
}

export function getDataset(client: BigQuery) {
  return client.dataset(DATASET_ID);
}
