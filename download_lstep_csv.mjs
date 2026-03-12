import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: '/tmp/lstep-storage-state.json',
    acceptDownloads: true
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  console.log('友だちリストに移動中...');
  await page.goto('https://manager.linestep.net/line/show', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log('Current URL:', url);

  if (url.includes('/account/login')) {
    console.error('ERROR: Cookie expired');
    await browser.close();
    process.exit(1);
  }

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }

  console.log('CSV操作タブをクリック...');
  await page.getByRole('tab', { name: 'CSV操作' }).click();
  await page.waitForTimeout(2000);

  console.log('CSVエクスポートボタンをクリック...');
  await page.locator('#csv_export_mover').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('CSVエクスポートページ:', page.url());

  console.log('履歴・お気に入りから表示条件入力をクリック...');
  await page.getByRole('link', { name: '履歴・お気に入りから表示条件入力' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('お気に入りの1番上をクリック...');
  await page.getByRole('link', { name: '表示項目をコピーして利用' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const initialCount = await page.getByRole('link', { name: 'ダウンロード' }).count();
  console.log('エクスポート前のダウンロードリンク数:', initialCount);

  console.log('この条件でダウンロードをクリック...');
  await page.getByRole('button', { name: 'この条件でダウンロード' }).click();
  await page.waitForLoadState('domcontentloaded');

  console.log('エクスポート完了を待機中...');
  let exportReady = false;
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(5000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const count = await page.getByRole('link', { name: 'ダウンロード' }).count();
    console.log('ポーリング ' + (i + 1) + '/18: ダウンロードリンク ' + count + '個 (初期: ' + initialCount + ')');

    if (count > initialCount) {
      exportReady = true;
      break;
    }
  }

  if (!exportReady) {
    console.error('ERROR: エクスポートが90秒以内に完了しませんでした');
    await browser.close();
    process.exit(1);
  }

  // Get the first download link href
  const downloadLinks = page.getByRole('link', { name: 'ダウンロード' });
  const href = await downloadLinks.first().getAttribute('href');
  console.log('Download href:', href);

  // Use context.on('page') to catch popup/new-tab downloads
  const csvPath = '/Users/kudo/Documents/work-backup/lstep_friends_latest.csv';

  // Listen for download event on context level
  const downloadPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('download timeout')), 30000);
    page.on('download', (dl) => {
      clearTimeout(timeout);
      resolve(dl);
    });
    // Also listen for new pages (popups)
    context.on('page', async (newPage) => {
      newPage.on('download', (dl) => {
        clearTimeout(timeout);
        resolve(dl);
      });
    });
  });

  await downloadLinks.first().click();

  try {
    const download = await downloadPromise;
    await download.saveAs(csvPath);
    console.log('CSV saved to:', csvPath);
  } catch (e) {
    console.log('Event-based download failed, trying direct navigation...');
    // Try navigating directly to the href
    if (href) {
      const fullUrl = href.startsWith('http') ? href : 'https://manager.linestep.net' + href;
      const response = await page.request.get(fullUrl);
      const body = await response.body();
      const { writeFileSync } = await import('fs');
      writeFileSync(csvPath, body);
      console.log('CSV saved via direct request to:', csvPath);
    }
  }

  await context.storageState({ path: '/tmp/lstep-storage-state.json' });
  await browser.close();
  console.log('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
