import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Storage } from '@google-cloud/storage';

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
}

export async function downloadObjectToFile(
  storage: Storage,
  bucketName: string,
  objectName: string,
  destination: string,
): Promise<boolean> {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  try {
    await ensureParentDirectory(destination);
    await file.download({ destination });
    return true;
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function uploadFileToGcs(
  storage: Storage,
  bucketName: string,
  sourcePath: string,
  destinationObject: string,
  contentType?: string,
): Promise<void> {
  const bucket = storage.bucket(bucketName);
  await bucket.upload(sourcePath, {
    destination: destinationObject,
    gzip: false,
    metadata: contentType ? { contentType } : undefined,
  });
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(typeof error === 'object' && error && 'code' in error && (error as { code?: number }).code === 404);
}
