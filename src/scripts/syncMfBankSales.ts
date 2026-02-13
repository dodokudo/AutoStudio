/**
 * マネーフォワード銀行入金 → BigQuery manual_sales 同期スクリプト
 *
 * 使用方法:
 *   npm run sales:sync:bank          # 同期実行
 *
 * GMOあおぞらネット銀行への入金(income)のうち、
 * 売上に該当するもののみをオートスタジオの manual_sales に同期する。
 *
 * データソース: BigQuery mark-454114.moneyforward.transactions
 * 同期先:       BigQuery mark-454114.autostudio_sales.manual_sales
 *
 * 除外対象:
 *   - 返済系（ペイトナー、フイナツクス、極度型ローン、差押）
 *   - ユニバペイ入金（クレカ売上と二重計上防止）
 *   - 利息・デビット取消・キャッシュバック
 */
import 'dotenv/config';
import { createBigQueryClient, resolveProjectId } from '../lib/bigquery';
import { upsertMfBankSales, autoCategorizeManualSales, type MfBankSale } from '../lib/sales/categories';

const PROJECT_ID = resolveProjectId();
const MF_DATASET = 'moneyforward';
const TARGET_ACCOUNT_NAME = 'GMOあおぞらネット銀行';

// 除外パターン（description に含まれていたら除外）
const EXCLUDE_PATTERNS = [
  'ペイトナ-',
  'フイナツクス',
  '極度型ローン',
  '差押',
  'ユニヴアペイ',
  '普通預金 利息',
  'VISAデビツトキヤツシユバツク',
  'クドウヒロヤ',
  'クドウ ヒロヤ',
  'ATM',
];

// 除外パターン（description がこれで始まっていたら除外）
const EXCLUDE_STARTS_WITH = [
  'Visaデビット',
];

interface MfTransaction {
  mf_id: string;
  date: string;
  description: string;
  amount: number;
}

function shouldExclude(tx: MfTransaction): string | null {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (tx.description.includes(pattern)) {
      return `パターン除外: "${pattern}"`;
    }
  }
  for (const prefix of EXCLUDE_STARTS_WITH) {
    if (tx.description.startsWith(prefix)) {
      return `プレフィックス除外: "${prefix}"`;
    }
  }
  return null;
}

function extractCustomerName(description: string): string {
  // "振込 オニダニ カオル" → "オニダニ カオル"
  if (description.startsWith('振込 ')) {
    return description.slice(3).trim();
  }
  return description;
}

async function main() {
  console.log('='.repeat(60));
  console.log('[sync:bank] マネーフォワード銀行入金 → BigQuery 同期開始');
  console.log('='.repeat(60));

  const client = createBigQueryClient(PROJECT_ID);

  // 対象口座の account_id を取得
  const [accountRows] = await client.query({
    query: `
      SELECT id FROM \`${PROJECT_ID}.${MF_DATASET}.accounts\`
      WHERE name = @name
    `,
    params: { name: TARGET_ACCOUNT_NAME },
  });

  const accounts = accountRows as Array<{ id: number }>;
  if (accounts.length === 0) {
    console.error(`[sync:bank] 口座 "${TARGET_ACCOUNT_NAME}" が見つかりません`);
    process.exit(1);
  }

  const accountId = accounts[0].id;
  console.log(`\n[sync:bank] 対象口座: ${TARGET_ACCOUNT_NAME} (id: ${accountId})`);

  // income トランザクションを BigQuery から取得
  console.log('[sync:bank] BigQuery (moneyforward) からデータ取得中...');
  const [txRows] = await client.query({
    query: `
      SELECT mf_id, date, description, amount
      FROM \`${PROJECT_ID}.${MF_DATASET}.transactions\`
      WHERE type = 'income'
        AND account_id = @accountId
        AND is_transfer = FALSE
      ORDER BY date DESC
    `,
    params: { accountId },
  });

  const transactions = (txRows as Array<Record<string, unknown>>).map(row => ({
    mf_id: String(row.mf_id),
    date: String(row.date),
    description: String(row.description ?? ''),
    amount: Number(row.amount),
  }));

  console.log(`[sync:bank] 取得件数: ${transactions.length}件`);

  if (transactions.length === 0) {
    console.log('[sync:bank] 同期するデータがありません');
    return;
  }

  // 期間を表示
  const dates = transactions.map(t => t.date);
  console.log(`[sync:bank] データ期間: ${dates[dates.length - 1]} ~ ${dates[0]}`);

  // フィルタリング
  const included: MfBankSale[] = [];
  const excluded: { tx: MfTransaction; reason: string }[] = [];

  for (const tx of transactions) {
    const excludeReason = shouldExclude(tx);
    if (excludeReason) {
      excluded.push({ tx, reason: excludeReason });
    } else {
      included.push({
        id: `mf_${tx.mf_id}`,
        amount: tx.amount,
        customerName: extractCustomerName(tx.description),
        note: tx.description,
        transactionDate: tx.date,
      });
    }
  }

  console.log(`\n[sync:bank] 対象: ${included.length}件`);
  console.log(`[sync:bank] 除外: ${excluded.length}件`);

  if (excluded.length > 0) {
    console.log('\n[sync:bank] 除外内訳:');
    for (const { tx, reason } of excluded) {
      console.log(`  - ${tx.date} ${tx.description} ¥${tx.amount.toLocaleString()} → ${reason}`);
    }
  }

  if (included.length === 0) {
    console.log('\n[sync:bank] 同期対象のデータがありません');
    return;
  }

  // BigQuery (autostudio_sales) に保存
  console.log('\n[sync:bank] BigQuery (autostudio_sales) に保存中...');
  const startTime = Date.now();

  const BATCH_SIZE = 500;
  let totalSaved = 0;

  for (let i = 0; i < included.length; i += BATCH_SIZE) {
    const batch = included.slice(i, i + BATCH_SIZE);
    const saved = await upsertMfBankSales(batch);
    totalSaved += saved;
    console.log(`[sync:bank] バッチ ${Math.floor(i / BATCH_SIZE) + 1}: ${saved}件保存`);
  }

  const saveTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[sync:bank] 保存完了: ${totalSaved}件 (${saveTime}秒)`);

  // 自動カテゴリ付与
  console.log('\n[sync:bank] 自動カテゴリ付与中...');
  const autoCategorized = await autoCategorizeManualSales();
  console.log(`[sync:bank] 自動カテゴリ付与: ${autoCategorized}件`);

  // 完了
  console.log('\n' + '='.repeat(60));
  console.log('[sync:bank] 同期完了');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('[sync:bank] エラー:', error);
  process.exit(1);
});
