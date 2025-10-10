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

  // List all folders in the main folder
  const response = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, createdTime, modifiedTime)',
    pageSize: 100,
  });

  const folders = response.data.files || [];

  if (folders.length === 0) {
    console.log('❌ No competitor folders found');
  } else {
    console.log(`✅ Found ${folders.length} competitor folder(s):\n`);

    for (const folder of folders) {
      console.log(`📁 ${folder.name}`);
      console.log(`   Folder ID: ${folder.id}`);

      // Count videos in each folder
      const videoResponse = await drive.files.list({
        q: `'${folder.id}' in parents and trashed = false and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov')`,
        fields: 'files(id, name, mimeType)',
        pageSize: 5,
      });

      const videoCount = videoResponse.data.files?.length || 0;
      console.log(`   Videos: ${videoCount}${videoCount >= 5 ? '+' : ''}`);

      if (videoCount > 0) {
        console.log(`   Sample files:`);
        videoResponse.data.files?.forEach(file => {
          console.log(`     - ${file.name}`);
        });
      }

      console.log('');
    }
  }
}

main().catch(console.error);
