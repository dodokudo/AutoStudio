/**
 * 売上カテゴリ管理
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';

export const SALES_CATEGORIES = [
  { id: 'frontend', label: 'フロントエンド' },
  { id: 'backend', label: 'バックエンド' },
  { id: 'backend_renewal', label: 'バックエンド継続' },
  { id: 'analyca', label: 'ANALYCA' },
  { id: 'corporate', label: '法人案件' },
  { id: 'other', label: 'その他' },
] as const;

export type SalesCategoryId = typeof SALES_CATEGORIES[number]['id'];

export interface ChargeCategory {
  chargeId: string;
  category: SalesCategoryId | null;
}

/**
 * カテゴリを取得
 */
export async function getChargeCategories(chargeIds: string[]): Promise<Map<string, SalesCategoryId>> {
  if (chargeIds.length === 0) {
    return new Map();
  }

  const client = createBigQueryClient(PROJECT_ID);

  const [rows] = await client.query({
    query: `
      SELECT charge_id, category
      FROM \`${PROJECT_ID}.${DATASET}.charge_categories\`
      WHERE charge_id IN UNNEST(@chargeIds)
    `,
    params: { chargeIds },
  });

  const result = new Map<string, SalesCategoryId>();
  for (const row of rows as Array<{ charge_id: string; category: string }>) {
    result.set(row.charge_id, row.category as SalesCategoryId);
  }
  return result;
}

/**
 * カテゴリを保存
 */
export async function setChargeCategory(chargeId: string, category: SalesCategoryId): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);

  await client.query({
    query: `
      MERGE \`${PROJECT_ID}.${DATASET}.charge_categories\` T
      USING (SELECT @chargeId as charge_id, @category as category, CURRENT_TIMESTAMP() as updated_at) S
      ON T.charge_id = S.charge_id
      WHEN MATCHED THEN
        UPDATE SET category = S.category, updated_at = S.updated_at
      WHEN NOT MATCHED THEN
        INSERT (charge_id, category, updated_at)
        VALUES (S.charge_id, S.category, S.updated_at)
    `,
    params: { chargeId, category },
  });
}

/**
 * 手動売上を取得
 */
export interface ManualSale {
  id: string;
  amount: number;
  category: SalesCategoryId;
  customerName: string;
  paymentMethod: string;
  note: string;
  transactionDate: string;
  paymentDate?: string | null;
  createdAt: string;
}

export async function getManualSales(startDate: string, endDate: string): Promise<ManualSale[]> {
  const client = createBigQueryClient(PROJECT_ID);

  const [rows] = await client.query({
    query: `
      SELECT
        id,
        amount,
        category,
        customer_name,
        payment_method,
        note,
        CAST(transaction_date AS STRING) as transaction_date,
        CAST(payment_date AS STRING) as payment_date,
        CAST(created_at AS STRING) as created_at
      FROM \`${PROJECT_ID}.${DATASET}.manual_sales\`
      WHERE transaction_date BETWEEN @startDate AND @endDate
      ORDER BY transaction_date DESC
    `,
    params: { startDate, endDate },
  });

  return (rows as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    amount: Number(row.amount),
    category: String(row.category) as SalesCategoryId,
    customerName: String(row.customer_name ?? ''),
    paymentMethod: String(row.payment_method ?? ''),
    note: String(row.note ?? ''),
    transactionDate: String(row.transaction_date),
    paymentDate: row.payment_date ? String(row.payment_date) : null,
    createdAt: String(row.created_at),
  }));
}

/**
 * 手動売上を追加
 */
export async function addManualSale(sale: Omit<ManualSale, 'id' | 'createdAt'>): Promise<string> {
  const client = createBigQueryClient(PROJECT_ID);
  const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await client.query({
    query: `
      INSERT INTO \`${PROJECT_ID}.${DATASET}.manual_sales\`
      (id, amount, category, customer_name, payment_method, note, transaction_date, payment_date, created_at, updated_at)
      VALUES (@id, @amount, @category, @customerName, @paymentMethod, @note, DATE(@transactionDate), DATE(@paymentDate), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `,
    params: {
      id,
      amount: sale.amount,
      category: sale.category,
      customerName: sale.customerName,
      paymentMethod: sale.paymentMethod,
      note: sale.note,
      transactionDate: sale.transactionDate,
      paymentDate: sale.paymentDate ?? sale.transactionDate,
    },
  });

  return id;
}

/**
 * 手動売上を削除
 */
export async function deleteManualSale(id: string): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);

  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.manual_sales\` WHERE id = @id`,
    params: { id },
  });
}

/**
 * 手動売上を更新
 */
export async function updateManualSale(
  id: string,
    updates: Partial<{
      customerName: string;
      amount: number;
      category: SalesCategoryId;
      paymentMethod: string;
      note: string;
      transactionDate: string;
      paymentDate: string;
    }>
): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);

  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP()'];
  const params: Record<string, unknown> = { id };

  if (updates.customerName !== undefined) {
    setClauses.push('customer_name = @customerName');
    params.customerName = updates.customerName;
  }
  if (updates.amount !== undefined) {
    setClauses.push('amount = @amount');
    params.amount = updates.amount;
  }
  if (updates.category !== undefined) {
    setClauses.push('category = @category');
    params.category = updates.category;
  }
  if (updates.paymentMethod !== undefined) {
    setClauses.push('payment_method = @paymentMethod');
    params.paymentMethod = updates.paymentMethod;
  }
  if (updates.note !== undefined) {
    setClauses.push('note = @note');
    params.note = updates.note;
  }
  if (updates.transactionDate !== undefined) {
    setClauses.push('transaction_date = DATE(@transactionDate)');
    params.transactionDate = updates.transactionDate;
  }
  if (updates.paymentDate !== undefined) {
    setClauses.push('payment_date = DATE(@paymentDate)');
    params.paymentDate = updates.paymentDate;
  }

  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.manual_sales\`
      SET ${setClauses.join(', ')}
      WHERE id = @id
    `,
    params,
  });
}
