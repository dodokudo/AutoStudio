/**
 * セミナー日別のクロス集計スクリプト
 *
 * Lステップのタグ友だち一覧ページで、「セミナー参加者」「FE購入者」の
 * 全タグ情報を読み取り、日付タグ（3M:3/14等）との紐づけで正確な日別データを算出。
 *
 * ロジック: 3M:3/14 タグ持ち × 3M:セミナー参加 タグ持ち → 3/14の参加者
 *          3M:3/14 タグ持ち × 3M:FE購入 タグ持ち → 3/14の購入者
 *
 * Usage:
 *   npx tsx src/scripts/scrapeSeminarCrosstab.ts [funnelId]
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium, Page } from 'playwright';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { LaunchKpi } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const DEFAULT_FUNNEL_ID = 'funnel-1770198372071';
const BASE_URL = 'https://manager.linestep.net';

const TAG_FOLDER = '3M：識別タグ';
const DATE_PATTERN = /3M:(\d{1,2}\/\d{1,2})/;

function isLoginPage(page: Page): boolean {
  return page.url().includes('/account/login');
}

/**
 * タグ友だち一覧ページから、各友だちが持つ日付タグを集計する
 * tagName: 対象タグ名（例: 3M:セミナー参加）
 * returns: { "3/14": 9, "3/15": 17, ... } のような日付→人数マップ
 */
async function getDateDistribution(page: Page, tagName: string): Promise<Record<string, number>> {
  const dateCounts: Record<string, number> = {};

  // タグページに移動してフォルダを開く
  await page.goto(`${BASE_URL}/line/tag`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  if (isLoginPage(page)) {
    throw new Error('Cookie期限切れ: npm run lstep:capture を実行してください');
  }

  // フォルダをクリック
  const folderLink = page.locator('span.tw-break-all', { hasText: TAG_FOLDER }).first();
  if ((await folderLink.count()) === 0) {
    throw new Error(`フォルダ「${TAG_FOLDER}」が見つかりません`);
  }
  await folderLink.click({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // 対象タグの「N人」リンクをクリック
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  let clicked = false;

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const rowText = await row.innerText();

    if (rowText.includes(tagName)) {
      const friendLink = row.locator('a').filter({ hasText: /\d+人/ }).first();
      if ((await friendLink.count()) > 0) {
        const linkText = await friendLink.innerText();
        console.log(`[crosstab] ${tagName}: ${linkText} → クリック`);

        const countMatch = linkText.match(/(\d+)/);
        if (countMatch && parseInt(countMatch[1]) === 0) {
          console.log(`[crosstab] ${tagName}: 0人のためスキップ`);
          return dateCounts;
        }

        await friendLink.click({ timeout: 5000 });
        await page.waitForTimeout(3000);
        clicked = true;
      }
      break;
    }
  }

  if (!clicked) {
    console.warn(`[crosstab] タグ「${tagName}」の友だちリンクが見つかりません`);
    return dateCounts;
  }

  // タグ友だち一覧ページ: 各友だちのタグ情報を読み取る
  console.log(`[crosstab] 遷移先: ${page.url()}`);

  let totalProcessed = 0;

  // ページネーションを含む全ページを処理
  let hasNextPage = true;
  while (hasNextPage) {
    // 各友だちの行を処理
    // ページ構造: テーブルの各行に「登録コード | 名前 | タグ一覧」がある
    const memberRows = page.locator('table tbody tr, .member-list tr, [class*="friend"] tr');
    const memberCount = await memberRows.count();

    if (memberCount === 0) {
      // テーブルがない場合、ページ全体のテキストからタグを抽出
      const pageText = await page.innerText('body');
      const dateMatches = pageText.match(/3M:\d{1,2}\/\d{1,2}/g);
      if (dateMatches) {
        for (const match of dateMatches) {
          const dm = match.match(DATE_PATTERN);
          if (dm) {
            dateCounts[dm[1]] = (dateCounts[dm[1]] || 0) + 1;
          }
        }
      }
    } else {
      for (let i = 0; i < memberCount; i++) {
        const memberRow = memberRows.nth(i);
        const memberText = await memberRow.innerText();

        // この友だちが持つ日付タグを抽出
        const dates = memberText.match(/3M:\d{1,2}\/\d{1,2}/g);
        if (dates) {
          // 重複除去（同じ日付タグが複数回表示される場合がある）
          const uniqueDates = [...new Set(dates)];
          for (const dateTag of uniqueDates) {
            const dm = dateTag.match(DATE_PATTERN);
            if (dm) {
              dateCounts[dm[1]] = (dateCounts[dm[1]] || 0) + 1;
              totalProcessed++;
            }
          }
        }
      }
    }

    // 次ページがあるか確認
    const nextBtn = page.locator('a[rel="next"], .pagination .next a, nav a:has-text("次へ")').first();
    if ((await nextBtn.count()) > 0 && (await nextBtn.isVisible())) {
      await nextBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } else {
      hasNextPage = false;
    }
  }

  console.log(`[crosstab] ${tagName} 日別集計: ${JSON.stringify(dateCounts)} (処理${totalProcessed}件)`);
  return dateCounts;
}

async function main(): Promise<void> {
  const funnelId = process.argv[2] || DEFAULT_FUNNEL_ID;
  console.log(`[crosstab] funnelId: ${funnelId}`);

  // 最新のstorage-stateを取得
  const { execSync } = await import('child_process');
  const latestState = execSync('ls -t /tmp/lstep-msg-*/storage-state.json 2>/dev/null | head -1')
    .toString()
    .trim();

  if (!latestState) {
    console.error('storage-state.json が見つかりません。npm run lstep:capture を実行してください。');
    process.exit(1);
  }
  console.log(`[crosstab] storage-state: ${latestState}`);

  // 現在のKPIデータを取得
  const bq = createBigQueryClient(PROJECT_ID);
  const [kpiRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!kpiRows || kpiRows.length === 0) {
    console.error('KPIデータが見つかりません');
    process.exit(1);
  }

  const currentKpi: LaunchKpi = JSON.parse((kpiRows[0] as { data: string }).data);

  // Playwright起動
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({ storageState: latestState });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // セミナー参加者の日別分布を取得
    const attendByDate = await getDateDistribution(page, '3M:セミナー参加');

    // FE購入者の日別分布を取得
    const purchaseByDate = await getDateDistribution(page, '3M:FE購入');

    // KPIに反映
    let updated = false;
    for (const day of currentKpi.seminarDays ?? []) {
      const monthDay = day.date.replace(/^2026-0?/, '').replace('-', '/');
      // "2026-03-14" → "3/14"
      const shortDate = `${parseInt(monthDay.split('/')[0])}/${parseInt(monthDay.split('/')[1])}`;

      const attendCount = attendByDate[shortDate] ?? 0;
      const purchaseCount = purchaseByDate[shortDate] ?? 0;

      if (attendCount > 0 || purchaseCount > 0) {
        day.attendActual = attendCount;
        day.purchaseCount = purchaseCount;
        updated = true;
      }

      console.log(`[crosstab] ${day.date} (${shortDate}): attend=${day.attendActual}, purchase=${day.purchaseCount}`);
    }

    if (updated) {
      // 保存（DELETE + INSERT）
      const dataJson = JSON.stringify(currentKpi);
      await bq.query({
        query: `DELETE FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId`,
        useLegacySql: false,
        params: { funnelId },
      });
      await bq.query({
        query: `INSERT INTO \`${KPI_TABLE}\` (funnel_id, data, updated_at) VALUES (@funnelId, @data, CURRENT_TIMESTAMP())`,
        useLegacySql: false,
        params: { funnelId, data: dataJson },
      });
      console.log('[crosstab] KPI更新完了');
    } else {
      console.log('[crosstab] 更新対象なし（全日程0人 or 未開催）');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[crosstab] エラー:', err);
  process.exit(1);
});
