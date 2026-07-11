import { Storage } from '@google-cloud/storage';
import { resolveProjectId } from './bigquery';

const BUCKET_NAME = process.env.THREADS_MEDIA_GCS_BUCKET ?? 'analyca-media';

function loadCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) return undefined;

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
    console.error('[gcs] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error);
    return undefined;
  }
}

function getStorage() {
  const credentials = loadCredentials();
  return new Storage({
    projectId: credentials?.project_id || resolveProjectId(),
    credentials,
    keyFilename: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
}

export async function uploadBufferToGCS(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  folder?: string,
): Promise<string | null> {
  try {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const fullFileName = folder ? `${folder}/${sanitizedName}` : sanitizedName;
    const storage = getStorage();
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(fullFileName);

    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    return `https://storage.googleapis.com/${BUCKET_NAME}/${fullFileName}`;
  } catch (error) {
    console.error('[gcs] Failed to upload buffer:', error);
    return null;
  }
}

export async function createSignedGCSUploadUrl(
  contentType: string,
  fileName: string,
  folder?: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  try {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const fullFileName = folder ? `${folder}/${sanitizedName}` : sanitizedName;
    const storage = getStorage();
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(fullFileName);
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    return {
      uploadUrl,
      publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${fullFileName}`,
    };
  } catch (error) {
    console.error('[gcs] Failed to create signed upload URL:', error);
    return null;
  }
}
