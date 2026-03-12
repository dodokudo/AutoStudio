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

  // Go to CSV export page
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }

  await page.getByRole('tab', { name: 'CSV操作' }).click();
  await page.waitForTimeout(2000);
  await page.locator('#csv_export_mover').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // Get the full page structure for the export configuration
  // Let's look for the tag/column selection area
  const html = await page.content();
  
  // Find all elements with "3M" text and their context
  const elements3M = await page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent;
      if (text && text.includes('3M')) {
        const parent = walker.currentNode.parentElement;
        results.push({
          text: text.trim(),
          tagName: parent?.tagName,
          className: parent?.className?.substring(0, 100),
          parentHtml: parent?.outerHTML?.substring(0, 300),
          grandparent: parent?.parentElement?.tagName + '.' + parent?.parentElement?.className?.substring(0, 50)
        });
      }
    }
    return results;
  });
  console.log('3M elements:', JSON.stringify(elements3M, null, 2));

  // Look at the structure of the export page - what sections exist
  const sections = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,.card-header,.panel-heading'));
    return headings.map(h => ({tag: h.tagName, text: h.textContent.trim().substring(0, 80), class: h.className?.substring(0, 50)}));
  });
  console.log('\nPage sections:', JSON.stringify(sections, null, 2));

  // Check if there's a tag selection with checkboxes
  const checkboxInfo = await page.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    return checkboxes.map(cb => {
      const label = cb.parentElement?.textContent?.trim() || cb.nextElementSibling?.textContent?.trim() || '';
      return {
        name: cb.name,
        value: cb.value,
        checked: cb.checked,
        label: label.substring(0, 80),
        id: cb.id
      };
    });
  });
  console.log('\nCheckboxes:', JSON.stringify(checkboxInfo, null, 2));

  // Look for "タグ" related areas that might have an expandable list
  const tagAreas = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[class*="tag"], [data-type*="tag"], [id*="tag"]'));
    return elements.map(e => ({
      tag: e.tagName,
      id: e.id,
      class: e.className?.substring(0, 100),
      text: e.textContent?.trim().substring(0, 200)
    }));
  });
  console.log('\nTag areas:', JSON.stringify(tagAreas.slice(0, 10), null, 2));

  // Let's also look for the selectable tag items (could be in a draggable list)
  const draggables = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[draggable], .sortable-item, .list-group-item, .selectable-item'));
    return items.map(i => ({
      tag: i.tagName,
      text: i.textContent?.trim().substring(0, 100),
      class: i.className?.substring(0, 80)
    }));
  });
  console.log('\nDraggable/selectable items:', draggables.length);
  if (draggables.length > 0) {
    console.log('First 5:', JSON.stringify(draggables.slice(0, 5), null, 2));
  }

  await context.storageState({ path: '/tmp/lstep-storage-state.json' });
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
