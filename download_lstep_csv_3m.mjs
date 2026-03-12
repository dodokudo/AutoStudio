import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });
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

  // Scroll down to find CSV tab
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
  await page.waitForTimeout(3000);
  console.log('CSVエクスポートページ:', page.url());

  // We are on the register page for CSV export
  // First, let's see what's on this page - look for tag selection
  // The export page should have a column/item selector
  
  // Take a screenshot to understand the page layout
  await page.screenshot({ path: '/tmp/lstep_export_page.png', fullPage: true });
  console.log('Screenshot saved to /tmp/lstep_export_page.png');

  // Look for the tag selection area
  // First check if there's a "タグ" section in the export config
  const pageContent = await page.content();
  
  // Find checkboxes or selectable items related to tags
  // Let's look for "3M" or "3月" in the page
  const has3M = pageContent.includes('3M');
  const has3月 = pageContent.includes('3月');
  console.log('Page has 3M:', has3M, 'Page has 3月:', has3月);

  // Let's look for the tag section - find "タグ" heading
  const tagSection = await page.locator('text=タグ').count();
  console.log('Tag section count:', tagSection);

  // Let's find all the checkboxes and their labels on the page
  const checkboxes = await page.locator('input[type="checkbox"]').count();
  console.log('Checkbox count:', checkboxes);

  // Find all labels that contain "3M" or look for tag folder "3月ローンチ"
  const allLabels = await page.locator('label').allTextContents();
  const tagLabels = allLabels.filter(l => l.includes('3M') || l.includes('3月'));
  console.log('3M/3月 labels:', tagLabels);
  
  // Look for a way to add more tags - there might be "追加" or "選択" buttons
  console.log('\nLooking for add/select buttons...');
  const buttons = await page.locator('button, a.btn').allTextContents();
  console.log('Buttons:', buttons.filter(b => b.trim()).map(b => b.trim()));

  // Check if there's a scrollable tag list
  // Let's search for any element containing "3M"
  const elements3M = await page.locator(':text("3M")').count();
  console.log('Elements with 3M text:', elements3M);

  // Let's also check for any select/dropdown elements
  const selects = await page.locator('select').count();
  console.log('Select elements:', selects);

  await context.storageState({ path: '/tmp/lstep-storage-state.json' });
  await browser.close();
  console.log('DONE - check screenshot at /tmp/lstep_export_page.png');
}

main().catch(e => { console.error(e); process.exit(1); });
