import { google } from 'googleapis';
import { createHash } from 'node:crypto';
import { MAX_SNAPSHOT_BYTES, snapshotFileDate, THREADS_INSIGHTS_FOLDER } from './threadsDriveCsv';

export function createThreadsDriveReader() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const credentials = raw ? JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) : undefined;
  if (credentials?.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials, keyFile: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const metadata = async (fileId: string) => (await drive.files.get({ fileId, supportsAllDrives: true,
    fields: 'id,name,mimeType,parents,trashed,size,md5Checksum,version',
  })).data;
  return {
    async list() {
      const folder = await metadata(THREADS_INSIGHTS_FOLDER);
      if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Configured folder is unavailable');
      const files: Array<{ id: string; name: string }> = [];
      let pageToken: string | undefined;
      do {
        const result = await drive.files.list({ q: `'${THREADS_INSIGHTS_FOLDER}' in parents and trashed = false`,
          fields: 'nextPageToken,incompleteSearch,files(id,name)', pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        if (result.data.incompleteSearch) throw new Error('Drive returned incomplete folder search');
        for (const file of result.data.files ?? []) if (file.id && file.name && snapshotFileDate(file.name)) files.push({ id: file.id, name: file.name });
        pageToken = result.data.nextPageToken ?? undefined;
      } while (pageToken);
      if (new Set(files.map((file) => file.name)).size !== files.length) throw new Error('Duplicate daily filenames: replace the existing file instead of adding a second copy');
      return files.sort((a, b) => a.name.localeCompare(b.name));
    },
    async read(fileId: string) {
      const before = await metadata(fileId);
      if (before.trashed || !before.parents?.includes(THREADS_INSIGHTS_FOLDER) || !before.name ||
          !['text/csv', 'text/plain', 'application/octet-stream', 'application/vnd.ms-excel'].includes(before.mimeType ?? '') ||
          !before.size || Number(before.size) > MAX_SNAPSHOT_BYTES || !before.md5Checksum || !before.version) {
        throw new Error('Expected a bounded CSV file in the configured folder');
      }
      const result = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer', maxContentLength: MAX_SNAPSHOT_BYTES });
      const bytes = Buffer.from(result.data as unknown as ArrayBuffer);
      const after = await metadata(fileId);
      if (bytes.length > MAX_SNAPSHOT_BYTES || before.version !== after.version ||
          before.md5Checksum !== createHash('md5').update(bytes).digest('hex') || after.trashed ||
          !after.parents?.includes(THREADS_INSIGHTS_FOLDER)) throw new Error('Drive file changed during read; retry later');
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), id: fileId, name: before.name, version: before.version };
    },
  };
}
