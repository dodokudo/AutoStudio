import { chromium } from 'playwright';

const ADMIN_EMAIL = 'test-admin@funnel-builder.dev';
const ADMIN_PASS = '4c5hKT0NrJf8CbXDn4DadsbbvdWX6y7F';
const STUDENT_ID = 'student-1775562961887';
const BASE = 'https://funnel-orcin.vercel.app';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("管理者ログイン")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASS);
  await Promise.all([
    page.waitForNavigation({ timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(3000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const putLatencies = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes(`/api/students/${STUDENT_ID}`)) {
      const start = Date.now();
      req.response().then((r) => {
        putLatencies.push({
          time: new Date().toISOString(),
          latency: Date.now() - start,
          status: r.status(),
          bodySize: req.postData()?.length || 0,
        });
      }).catch(() => {});
    }
  });

  await login(page);
  await page.goto(`${BASE}/s/${STUDENT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // ドキュメントタブ
  await page.locator('text=ドキュメント').first().click();
  await page.waitForTimeout(2000);

  const editor = page.locator('.ProseMirror').first();

  // === テスト: 5文字を早めに打ち（300ms間隔）+8秒待つ（現実的入力）===
  putLatencies.length = 0;
  console.log('\n=== 5文字を300ms間隔で入力（タイピング→止まる）===');
  await editor.click();
  await page.keyboard.press('End');
  const unique1 = Date.now().toString(36);
  await page.keyboard.type(unique1, { delay: 300 });
  const typingDone = Date.now();
  // 保存中が出るまでの時間を観測
  const savingShownAt = await page.waitForSelector('text=保存中', { timeout: 8000 }).then(() => Date.now()).catch(() => null);
  console.log(`  タイピング完了から「保存中」表示まで: ${savingShownAt ? savingShownAt - typingDone + 'ms' : '未表示'}`);
  await page.waitForTimeout(9000);
  console.log(`  PUT数: ${putLatencies.length}`);
  putLatencies.forEach((p, i) => console.log(`  [${i+1}] ${p.latency}ms ${p.bodySize}B`));

  // === 長文タイピング途中で中断せず最後まで打つ ===
  putLatencies.length = 0;
  await page.waitForTimeout(1000);
  console.log('\n=== 10文字を200ms間隔で入力（連続タイプ）===');
  await editor.click();
  await page.keyboard.press('End');
  const unique2 = 'z' + Date.now().toString(36).slice(0, 9);
  const typingStart = Date.now();
  await page.keyboard.type(unique2, { delay: 200 });
  console.log(`  タイピング時間: ${Date.now() - typingStart}ms`);
  await page.waitForTimeout(9000);
  console.log(`  PUT数: ${putLatencies.length}`);
  putLatencies.forEach((p, i) => console.log(`  [${i+1}] ${p.latency}ms ${p.bodySize}B`));

  // === 連続タイピング30文字（debounceが効くか）===
  putLatencies.length = 0;
  await page.waitForTimeout(1000);
  console.log('\n=== 30文字連続タイプ（80ms間隔、止まらない）===');
  await editor.click();
  await page.keyboard.press('End');
  const unique3 = 'a' + 'x'.repeat(28) + Date.now().toString(36).slice(0, 1);
  const t3 = Date.now();
  await page.keyboard.type(unique3, { delay: 80 });
  console.log(`  タイピング時間: ${Date.now() - t3}ms`);
  await page.waitForTimeout(9000);
  console.log(`  PUT数: ${putLatencies.length}`);
  putLatencies.forEach((p, i) => console.log(`  [${i+1}] ${p.latency}ms ${p.bodySize}B`));

  await browser.close();
})();
