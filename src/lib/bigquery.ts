import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'autostudio_threads';
const DEFAULT_PROJECT_ID = 'mark-454114';

export function resolveProjectId(value?: string): string {
  const candidate = value ?? process.env.BQ_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  const trimmed = candidate.trim();
  const unquoted = trimmed.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
  return unquoted || DEFAULT_PROJECT_ID;
}

function loadCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (rawJson) {
    try {
      console.log('[bigquery] Raw JSON length:', rawJson.length);
      const maybeBase64 = rawJson.trim();

      let jsonString;
      if (maybeBase64.startsWith('{')) {
        console.log('[bigquery] Detected raw JSON format');
        jsonString = maybeBase64;
      } else {
        console.log('[bigquery] Detected Base64 format, decoding...');
        jsonString = Buffer.from(maybeBase64, 'base64').toString('utf8');
        console.log('[bigquery] Decoded JSON length:', jsonString.length);
      }

      const credentials = JSON.parse(jsonString);
      console.log('[bigquery] Successfully parsed credentials for project:', credentials.project_id);

      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        console.log('[bigquery] Fixed private_key newlines');
      }

      return credentials;
    } catch (error) {
      console.error('[bigquery] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error instanceof Error ? error.message : String(error));
      console.error('[bigquery] Raw input (first 100 chars):', rawJson?.substring(0, 100));
      return undefined;
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.info('[bigquery] Using GOOGLE_APPLICATION_CREDENTIALS path for credentials');
  }

  return undefined;
}

export function createBigQueryClient(projectId?: string, location?: string) {
  const resolvedProjectId = resolveProjectId(projectId);
  const credentials = loadCredentials();
  return new BigQuery({
    projectId: resolvedProjectId,
    credentials,
    keyFilename: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    location: location || process.env.LSTEP_BQ_LOCATION || 'US',
  });
}

export function getDataset(client: BigQuery) {
  return client.dataset(DATASET_ID);
}
