import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: '/tmp/lstep-storage-state.json',
    acceptDownloads: true
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto('https://manager.linestep.net/line/show', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }

  await page.getByRole('tab', { name: 'CSV操作' }).click();
  await page.waitForTimeout(2000);
  await page.locator('#csv_export_mover').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000); // Wait longer for SPA

  // Get main content area
  const mainContent = await page.evaluate(() => {
    const main = document.querySelector('.main');
    if (!main) return 'No .main found';
    return main.innerHTML.substring(0, 10000);
  });
  console.log('Main content (first 5000 chars):');
  console.log(mainContent.substring(0, 5000));
  
  console.log('\n\n=== LOOKING FOR TAG/COLUMN CONFIGURATION ===');
  
  // Find all visible text on the page that relates to columns/tags
  const visibleText = await page.evaluate(() => {
    const main = document.querySelector('.main') || document.body;
    const texts = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent?.trim();
      if (t && t.length > 1 && t.length < 100) {
        texts.push(t);
      }
    }
    return [...new Set(texts)];
  });
  console.log('\nVisible texts on page:');
  visibleText.forEach(t => console.log('  ' + t));

  await context.storageState({ path: '/tmp/lstep-storage-state.json' });
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
