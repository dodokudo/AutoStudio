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
  await page.waitForTimeout(3000);

  // Get the main content area HTML structure (not full HTML, just key parts)
  const structure = await page.evaluate(() => {
    // Look for main content container
    const main = document.querySelector('.main-content, .content-wrapper, main, #main, .page-content');
    if (!main) {
      // Get all text on the page with structure
      const body = document.body;
      const allText = [];
      function traverse(el, depth) {
        if (depth > 5) return;
        const tag = el.tagName?.toLowerCase();
        const cls = el.className?.toString().substring(0, 40) || '';
        const text = el.childNodes.length === 0 ? el.textContent?.trim().substring(0, 100) : '';
        if (tag && (tag.match(/^(div|section|ul|li|table|form|h[1-6]|button|a|label|input|select|option)$/))) {
          const id = el.id ? '#' + el.id : '';
          allText.push('  '.repeat(depth) + `<${tag}${id}${cls ? '.' + cls.replace(/\s+/g, '.').substring(0, 40) : ''}> ${text}`);
        }
        for (const child of el.children) {
          traverse(child, depth + 1);
        }
      }
      traverse(body, 0);
      return allText.join('\n');
    }
    return main.innerHTML.substring(0, 5000);
  });
  console.log('Page structure (top portion):');
  console.log(structure.substring(0, 3000));

  // Also check: are there tabs or sections for "タグ", "友だち情報", "流入経路" etc?
  console.log('\n\n--- Looking for tab/section buttons ---');
  const tabs = await page.evaluate(() => {
    const tabLike = Array.from(document.querySelectorAll('a[role="tab"], .nav-link, .tab-pane, [data-toggle="tab"], [data-bs-toggle="tab"]'));
    return tabLike.map(t => ({
      text: t.textContent?.trim().substring(0, 50),
      href: t.getAttribute('href'),
      class: t.className?.substring(0, 60)
    }));
  });
  console.log('Tabs:', JSON.stringify(tabs, null, 2));

  // Check for "selected columns" area that shows the columns already added  
  const selectedColumns = await page.evaluate(() => {
    // Search for the "selected" or "chosen" column area
    const areas = Array.from(document.querySelectorAll('.selected, .chosen, [class*="selected"], [class*="chosen"], .sortable'));
    return areas.map(a => ({
      class: a.className?.substring(0, 80),
      text: a.textContent?.trim().substring(0, 300),
      children: a.children.length
    }));
  });
  console.log('\nSelected/chosen areas:', JSON.stringify(selectedColumns, null, 2));

  // Check for multi-select or transfer-list patterns
  const multiSelects = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.transfer-list, .dual-list, [class*="multi"], .list-group'));
    return items.map(i => ({
      class: i.className?.substring(0, 80),
      text: i.textContent?.trim().substring(0, 200),
      children: i.children.length
    }));
  });
  console.log('\nMulti-select areas:', JSON.stringify(multiSelects, null, 2));

  await context.storageState({ path: '/tmp/lstep-storage-state.json' });
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
