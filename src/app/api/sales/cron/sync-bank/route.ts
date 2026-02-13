import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { upsertMfBankSales, type MfBankSale } from '@/lib/sales/categories';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROJECT_ID = resolveProjectId();
const MF_DATASET = 'moneyforward';
const TARGET_ACCOUNT_NAME = 'GMOあおぞらネット銀行';

const EXCLUDE_PATTERNS = [
  'ペイトナ-',
  'フイナツクス',
  '極度型ローン',
  '差押',
  'ユニヴアペイ',
  '普通預金 利息',
  'VISAデビツトキヤツシユバツク',
];

const EXCLUDE_STARTS_WITH = [
  'Visaデビット',
];

function shouldExclude(description: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (description.includes(pattern)) return true;
  }
  for (const prefix of EXCLUDE_STARTS_WITH) {
    if (description.startsWith(prefix)) return true;
  }
  return false;
}

function extractCustomerName(description: string): string {
  if (description.startsWith('振込 ')) {
    return description.slice(3).trim();
  }
  return description;
}

async function handleSync() {
  const startTime = Date.now();

  try {
    console.log('[sales/cron/sync-bank] Started at', new Date().toISOString());

    const client = createBigQueryClient(PROJECT_ID);

    // 対象口座のaccount_idを取得
    const [accountRows] = await client.query({
      query: `SELECT id FROM \`${PROJECT_ID}.${MF_DATASET}.accounts\` WHERE name = @name`,
      params: { name: TARGET_ACCOUNT_NAME },
    });

    const accounts = accountRows as Array<{ id: number }>;
    if (accounts.length === 0) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 500 });
    }

    // BigQuery(moneyforward)からincomeを取得
    const [txRows] = await client.query({
      query: `
        SELECT mf_id, date, description, amount
        FROM \`${PROJECT_ID}.${MF_DATASET}.transactions\`
        WHERE type = 'income' AND account_id = @accountId AND is_transfer = FALSE
        ORDER BY date DESC
      `,
      params: { accountId: accounts[0].id },
    });

    const transactions = (txRows as Array<Record<string, unknown>>).map(row => ({
      mf_id: String(row.mf_id),
      date: String(row.date),
      description: String(row.description ?? ''),
      amount: Number(row.amount),
    }));

    // フィルタリング
    const sales: MfBankSale[] = [];
    for (const tx of transactions) {
      if (!shouldExclude(tx.description)) {
        sales.push({
          id: `mf_${tx.mf_id}`,
          amount: tx.amount,
          customerName: extractCustomerName(tx.description),
          note: tx.description,
          transactionDate: tx.date,
        });
      }
    }

    if (sales.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No bank sales to sync',
        timestamp: new Date().toISOString(),
      });
    }

    // upsert
    const BATCH_SIZE = 500;
    let totalSaved = 0;
    for (let i = 0; i < sales.length; i += BATCH_SIZE) {
      const batch = sales.slice(i, i + BATCH_SIZE);
      totalSaved += await upsertMfBankSales(batch);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('[sales/cron/sync-bank] Completed:', {
      fetched: transactions.length,
      excluded: transactions.length - sales.length,
      synced: totalSaved,
      duration: `${duration}s`,
    });

    return NextResponse.json({
      success: true,
      fetched: transactions.length,
      excluded: transactions.length - sales.length,
      synced: totalSaved,
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sales/cron/sync-bank] Failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}
