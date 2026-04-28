import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '@google-cloud/storage';
import { chromium } from 'playwright';
import { loadLstepConfig } from '@/lib/lstep/config';
import { cleanupWorkspace } from '@/lib/lstep/downloader';
import { uploadFileToGcs } from '@/lib/lstep/gcs';

async function main(): Promise<void> {
  const config = loadLstepConfig();
  const storage = new Storage();

  const workspaceDir = await mkdtemp(join(tmpdir(), 'lstep-capture-'));
  const storageStatePath = join(workspaceDir, 'storage-state.json');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Lstepログインページを開きます。reCAPTCHAを含め手動でログインしてください。');
  await page.goto(config.loginUrl, { waitUntil: 'networkidle' });

  console.log('ログイン完了を自動検知します（最大10分待機）...');
  const deadline = Date.now() + 10 * 60 * 1000;
  let detected = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    const url = page.url();
    if (!url.includes('/account/login')) {
      console.log('ログイン検知: URL =', url);
      detected = true;
      break;
    }
  }

  if (!detected) {
    throw new Error('10分以内にログインが完了しませんでした');
  }

  await page.waitForTimeout(5000);

  await context.storageState({ path: storageStatePath });
  await browser.close();

  await uploadFileToGcs(storage, config.gcsBucket, storageStatePath, config.storageStateObject, 'application/json');

  console.log('ストレージステートをGCSに保存しました:', `gs://${config.gcsBucket}/${config.storageStateObject}`);

  await cleanupWorkspace(workspaceDir);
}

main().catch((error) => {
  console.error('ストレージステート取得に失敗しました', error);
  process.exitCode = 1;
});
