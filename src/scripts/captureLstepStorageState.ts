import 'dotenv/config';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
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

  const rl = readline.createInterface({ input, output });
  await rl.question('ログイン完了後にEnterを押してください（ログイン状態が保存されます）...');
  rl.close();

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
