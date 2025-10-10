import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { google } from 'googleapis';

const FOLDER_ID = process.env.IG_COMPETITOR_DRIVE_FOLDER_ID;

async function main() {
  if (!FOLDER_ID) {
    console.error('IG_COMPETITOR_DRIVE_FOLDER_ID is not set');
    return;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  console.log(`Checking Drive folder: ${FOLDER_ID}\n`);

  // List ALL files and folders in the main folder
  const response = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  });

  const files = response.data.files || [];

  if (files.length === 0) {
    console.log('❌ Folder is empty');
  } else {
    console.log(`✅ Found ${files.length} item(s) in the folder:\n`);

    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const videos = files.filter(f => f.mimeType?.startsWith('video/'));
    const others = files.filter(f =>
      f.mimeType !== 'application/vnd.google-apps.folder' &&
      !f.mimeType?.startsWith('video/')
    );

    if (folders.length > 0) {
      console.log(`📁 Folders (${folders.length}):`);
      folders.forEach(f => console.log(`   - ${f.name} (${f.id})`));
      console.log('');
    }

    if (videos.length > 0) {
      console.log(`🎥 Videos (${videos.length}):`);
      videos.forEach(f => {
        const sizeMB = f.size ? (parseInt(f.size) / 1024 / 1024).toFixed(2) : 'unknown';
        console.log(`   - ${f.name} (${sizeMB} MB)`);
        console.log(`     ID: ${f.id}`);
        console.log(`     Modified: ${f.modifiedTime}`);
      });
      console.log('');
    }

    if (others.length > 0) {
      console.log(`📄 Other files (${others.length}):`);
      others.slice(0, 10).forEach(f => console.log(`   - ${f.name} (${f.mimeType})`));
      if (others.length > 10) {
        console.log(`   ... and ${others.length - 10} more`);
      }
    }
  }
}

main().catch(console.error);
