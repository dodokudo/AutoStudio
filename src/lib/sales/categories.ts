/**
 * 売上カテゴリ管理
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';
const MANUAL_SPLITS_TABLE = 'manual_sale_splits';

export const SALES_CATEGORIES = [
  { id: 'frontend', label: 'フロントエンド' },
  { id: 'backend', label: 'バックエンド' },
  { id: 'backend_performance', label: 'バックエンド成果報酬' },
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
  parentSaleId?: string | null;
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
      WITH base_sales AS (
        SELECT
          id,
          CAST(NULL AS STRING) AS parent_sale_id,
          amount,
          category,
          customer_name,
          payment_method,
          note,
          transaction_date,
          payment_date,
          created_at
        FROM \`${PROJECT_ID}.${DATASET}.manual_sales\` sale
        WHERE transaction_date BETWEEN @startDate AND @endDate
          AND NOT EXISTS (
            SELECT 1
            FROM \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\` split
            WHERE split.parent_sale_id = sale.id
          )
      ),
      split_sales AS (
        SELECT
          split.split_id AS id,
          split.parent_sale_id,
          split.amount,
          split.category,
          COALESCE(NULLIF(split.customer_name, ''), parent.customer_name) AS customer_name,
          parent.payment_method,
          split.note,
          parent.transaction_date,
          parent.payment_date,
          split.created_at
        FROM \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\` split
        JOIN \`${PROJECT_ID}.${DATASET}.manual_sales\` parent
          ON parent.id = split.parent_sale_id
        WHERE parent.transaction_date BETWEEN @startDate AND @endDate
      )
      SELECT
        id,
        parent_sale_id,
        amount,
        category,
        customer_name,
        payment_method,
        note,
        CAST(transaction_date AS STRING) AS transaction_date,
        CAST(payment_date AS STRING) AS payment_date,
        CAST(created_at AS STRING) AS created_at
      FROM (
        SELECT * FROM base_sales
        UNION ALL
        SELECT * FROM split_sales
      )
      ORDER BY transaction_date DESC
    `,
    params: { startDate, endDate },
  });

  return (rows as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    parentSaleId: row.parent_sale_id ? String(row.parent_sale_id) : null,
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

export async function initManualSaleSplitsTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const table = client.dataset(DATASET).table(MANUAL_SPLITS_TABLE);
  const [exists] = await table.exists();
  if (exists) return;

  await table.create({
    schema: {
      fields: [
        { name: 'parent_sale_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'split_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'amount', type: 'INTEGER', mode: 'REQUIRED' },
        { name: 'category', type: 'STRING', mode: 'REQUIRED' },
        { name: 'customer_name', type: 'STRING' },
        { name: 'note', type: 'STRING' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' },
      ],
    },
  });
}

export async function splitManualSale(
  parentSaleId: string,
  splits: Array<{
    amount: number;
    category: SalesCategoryId;
    customerName?: string;
    note?: string;
  }>,
): Promise<void> {
  if (splits.length < 2) {
    throw new Error('At least 2 split rows are required');
  }
  await initManualSaleSplitsTable();
  const client = createBigQueryClient(PROJECT_ID);

  const [parentRows] = await client.query({
    query: `
      SELECT amount
      FROM \`${PROJECT_ID}.${DATASET}.manual_sales\`
      WHERE id = @parentSaleId
    `,
    params: { parentSaleId },
  });
  const parentAmount = Number((parentRows as Array<{ amount: number }>)[0]?.amount ?? 0);
  const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
  if (!parentAmount || parentAmount !== splitTotal) {
    throw new Error(`Split total (${splitTotal}) must match parent amount (${parentAmount})`);
  }

  const values = splits
    .map((_, index) =>
      `(@parentSaleId, @splitId${index}, @amount${index}, @category${index}, @customerName${index}, @note${index}, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
    )
    .join(', ');
  const params: Record<string, string | number> = { parentSaleId };
  splits.forEach((split, index) => {
    params[`splitId${index}`] = `split_${parentSaleId}_${index + 1}`;
    params[`amount${index}`] = split.amount;
    params[`category${index}`] = split.category;
    params[`customerName${index}`] = split.customerName ?? '';
    params[`note${index}`] = split.note ?? '';
  });

  await client.query({
    query: `
      BEGIN TRANSACTION;
      DELETE FROM \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\`
      WHERE parent_sale_id = @parentSaleId;
      INSERT INTO \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\`
        (parent_sale_id, split_id, amount, category, customer_name, note, created_at, updated_at)
      VALUES ${values};
      COMMIT TRANSACTION;
    `,
    params,
  });
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

  if (id.startsWith('split_')) {
    await client.query({
      query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\` WHERE split_id = @id`,
      params: { id },
    });
    return;
  }

  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.manual_sales\` WHERE id = @id`,
    params: { id },
  });
}

/**
 * MF銀行入金を一括upsert（MERGE: 既存は更新、新規は挿入）
 */
export interface MfBankSale {
  id: string;          // mf_{mf_id}
  amount: number;
  customerName: string;
  note: string;
  transactionDate: string; // YYYY-MM-DD
}

const normalizeBankCustomerName = (value: string) =>
  value.normalize('NFKC').toUpperCase().replace(/[\s　]+/g, '');

const isBeConfidentCustomer = (value: string) =>
  normalizeBankCustomerName(value).includes('BECONFIDENT');

function getExplicitBankCategory(
  customerName: string,
  amount: number,
): SalesCategoryId | null {
  if (!isBeConfidentCustomer(customerName)) return null;
  if (amount === 100000) return 'backend_performance';
  if (amount === 33000) return 'backend_renewal';
  return null;
}

/**
 * 株式会社BE CONFIDENT（伊藤沙織さん）の133,000円入金は、
 * 成果報酬100,000円＋継続33,000円として自動分割する。
 * 既に分割済みの親売上は再作成しない。
 */
export async function applyRecurringManualSaleSplits(
  sales: MfBankSale[],
): Promise<number> {
  const targets = sales.filter(
    (sale) => sale.amount === 133000 && isBeConfidentCustomer(sale.customerName),
  );
  if (targets.length === 0) return 0;

  await initManualSaleSplitsTable();
  const client = createBigQueryClient(PROJECT_ID);
  const parentSaleIds = targets.map((sale) => sale.id);
  const [existingRows] = await client.query({
    query: `
      SELECT DISTINCT parent_sale_id
      FROM \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\`
      WHERE parent_sale_id IN UNNEST(@parentSaleIds)
    `,
    params: { parentSaleIds },
  });
  const existingIds = new Set(
    (existingRows as Array<{ parent_sale_id: string }>).map((row) => row.parent_sale_id),
  );

  let splitCount = 0;
  for (const sale of targets) {
    if (existingIds.has(sale.id)) continue;
    await splitManualSale(sale.id, [
      {
        amount: 100000,
        category: 'backend_performance',
        customerName: '伊藤沙織',
        note: '株式会社BE CONFIDENT 成果報酬',
      },
      {
        amount: 33000,
        category: 'backend_renewal',
        customerName: '伊藤沙織',
        note: '株式会社BE CONFIDENT 継続',
      },
    ]);
    splitCount += 1;
  }

  return splitCount;
}

export async function upsertMfBankSales(sales: MfBankSale[]): Promise<number> {
  if (sales.length === 0) return 0;

  const client = createBigQueryClient(PROJECT_ID);
  const tempTableId = `manual_sales_temp_${Date.now()}`;
  const dataset = client.dataset(DATASET);
  const tempTable = dataset.table(tempTableId);

  try {
    await tempTable.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'amount', type: 'INTEGER' },
          { name: 'category', type: 'STRING' },
          { name: 'customer_name', type: 'STRING' },
          { name: 'payment_method', type: 'STRING' },
          { name: 'note', type: 'STRING' },
          { name: 'transaction_date', type: 'DATE' },
          { name: 'payment_date', type: 'DATE' },
          { name: 'created_at', type: 'TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP' },
        ],
      },
    });

    const now = new Date().toISOString();
    const rows = sales.map(s => ({
      id: s.id,
      amount: s.amount,
      category: 'other',
      customer_name: s.customerName,
      payment_method: 'bank_transfer',
      note: s.note,
      transaction_date: s.transactionDate,
      payment_date: s.transactionDate,
      created_at: now,
      updated_at: now,
    }));

    await tempTable.insert(rows);

    await client.query({
      query: `
        MERGE \`${PROJECT_ID}.${DATASET}.manual_sales\` T
        USING \`${PROJECT_ID}.${DATASET}.${tempTableId}\` S
        ON T.id = S.id
        WHEN MATCHED THEN
          UPDATE SET
            amount = S.amount,
            customer_name = S.customer_name,
            note = S.note,
            transaction_date = S.transaction_date,
            payment_date = S.payment_date,
            updated_at = S.updated_at
        WHEN NOT MATCHED THEN
          INSERT (id, amount, category, customer_name, payment_method, note,
                  transaction_date, payment_date, created_at, updated_at)
          VALUES (S.id, S.amount, S.category, S.customer_name, S.payment_method, S.note,
                  S.transaction_date, S.payment_date, S.created_at, S.updated_at)
      `,
    });

    return sales.length;
  } finally {
    try {
      await tempTable.delete();
    } catch {
      // 削除失敗は無視
    }
  }
}

/**
 * UnivaPay課金の自動カテゴリ付与
 * 同じ顧客名＋同じ金額の過去取引にカテゴリが設定済みなら、未設定の取引にも自動適用
 */
export async function autoCategorizeCharges(): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID);

  const sourceCTE = `
    WITH categorized_patterns AS (
      SELECT
        JSON_VALUE(c.metadata, '$."univapay-name"') as customer_name,
        c.charged_amount,
        ARRAY_AGG(DISTINCT cc.category LIMIT 1)[OFFSET(0)] AS category
      FROM \`${PROJECT_ID}.${DATASET}.charges\` c
      JOIN \`${PROJECT_ID}.${DATASET}.charge_categories\` cc ON c.id = cc.charge_id
      WHERE c.mode = 'live' AND c.status = 'successful'
        AND JSON_VALUE(c.metadata, '$."univapay-name"') IS NOT NULL
      GROUP BY customer_name, c.charged_amount
      HAVING COUNT(DISTINCT cc.category) = 1
    )
    SELECT c.id as charge_id, cp.category
    FROM \`${PROJECT_ID}.${DATASET}.charges\` c
    LEFT JOIN \`${PROJECT_ID}.${DATASET}.charge_categories\` existing ON c.id = existing.charge_id
    JOIN categorized_patterns cp
      ON JSON_VALUE(c.metadata, '$."univapay-name"') = cp.customer_name
      AND c.charged_amount = cp.charged_amount
    WHERE c.mode = 'live' AND c.status = 'successful'
      AND existing.charge_id IS NULL
  `;

  // 先に対象件数を取得
  const [countRows] = await client.query({
    query: `SELECT COUNT(*) as cnt FROM (${sourceCTE})`,
  });
  const count = Number((countRows as Array<{ cnt: number }>)[0].cnt);
  if (count === 0) return 0;

  // MERGE実行
  await client.query({
    query: `
      MERGE \`${PROJECT_ID}.${DATASET}.charge_categories\` T
      USING (${sourceCTE}) S
      ON T.charge_id = S.charge_id
      WHEN NOT MATCHED THEN
        INSERT (charge_id, category, updated_at)
        VALUES (S.charge_id, S.category, CURRENT_TIMESTAMP())
    `,
  });

  return count;
}

/**
 * MF銀行入金の自動カテゴリ付与
 *
 * 優先順位:
 * 1. 同じ顧客名+同じ金額で既にカテゴリ設定済み → そのカテゴリを適用
 * 2. 同じ顧客名で1種類のカテゴリしかない → 金額が違っても適用（例: ワイツージュエリーは常にcorporate）
 */
export async function autoCategorizeManualSales(): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID);

  // Step 1: カテゴリ設定済みのパターンを取得
  const [patternRows] = await client.query({
    query: `
      SELECT customer_name, amount, category
      FROM \`${PROJECT_ID}.${DATASET}.manual_sales\`
      WHERE category != 'other'
    `,
  });
  const patterns = patternRows as Array<{ customer_name: string; amount: number; category: string }>;
  if (patterns.length === 0) return 0;

  // 顧客名+金額の完全一致ルール。同じ組み合わせに複数カテゴリーがある場合は自動判定しない。
  const exactCategories = new Map<string, Set<string>>();
  for (const p of patterns) {
    const key = `${p.customer_name}|${p.amount}`;
    if (!exactCategories.has(key)) {
      exactCategories.set(key, new Set());
    }
    exactCategories.get(key)!.add(p.category);
  }
  const exactRules = new Map<string, string>();
  for (const [key, categories] of exactCategories) {
    if (categories.size === 1) {
      exactRules.set(key, [...categories][0]);
    }
  }

  // 顧客名のみルール（カテゴリが1種類だけの顧客）
  const nameCategories = new Map<string, Set<string>>();
  for (const p of patterns) {
    if (!nameCategories.has(p.customer_name)) {
      nameCategories.set(p.customer_name, new Set());
    }
    nameCategories.get(p.customer_name)!.add(p.category);
  }
  const nameOnlyRules = new Map<string, string>();
  for (const [name, cats] of nameCategories) {
    if (cats.size === 1) {
      nameOnlyRules.set(name, [...cats][0]);
    }
  }

  // Step 2: 未設定のレコードを取得
  const [uncatRows] = await client.query({
    query: `
      SELECT id, customer_name, amount
      FROM \`${PROJECT_ID}.${DATASET}.manual_sales\`
      WHERE category = 'other'
    `,
  });
  const uncategorized = uncatRows as Array<{ id: string; customer_name: string; amount: number }>;
  if (uncategorized.length === 0) return 0;

  // Step 3: マッチング（exact優先、なければname_only）
  const updates: Array<{ id: string; category: string }> = [];
  for (const row of uncategorized) {
    const exactKey = `${row.customer_name}|${row.amount}`;
    const category =
      getExplicitBankCategory(row.customer_name, row.amount) ??
      exactRules.get(exactKey) ??
      nameOnlyRules.get(row.customer_name);
    if (category) {
      updates.push({ id: row.id, category });
    }
  }
  if (updates.length === 0) return 0;

  // Step 4: UPDATE（バッチ）
  const caseLines = updates.map(u => `WHEN '${u.id}' THEN '${u.category}'`).join('\n            ');
  const idList = updates.map(u => `'${u.id}'`).join(',');

  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.manual_sales\`
      SET
        category = CASE id
            ${caseLines}
        END,
        updated_at = CURRENT_TIMESTAMP()
      WHERE id IN (${idList})
    `,
  });

  return updates.length;
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

  if (id.startsWith('split_')) {
    const splitSetClauses: string[] = ['updated_at = CURRENT_TIMESTAMP()'];
    const splitParams: Record<string, unknown> = { id };
    if (updates.customerName !== undefined) {
      splitSetClauses.push('customer_name = @customerName');
      splitParams.customerName = updates.customerName;
    }
    if (updates.amount !== undefined) {
      splitSetClauses.push('amount = @amount');
      splitParams.amount = updates.amount;
    }
    if (updates.category !== undefined) {
      splitSetClauses.push('category = @category');
      splitParams.category = updates.category;
    }
    if (updates.note !== undefined) {
      splitSetClauses.push('note = @note');
      splitParams.note = updates.note;
    }

    await client.query({
      query: `
        UPDATE \`${PROJECT_ID}.${DATASET}.${MANUAL_SPLITS_TABLE}\`
        SET ${splitSetClauses.join(', ')}
        WHERE split_id = @id
      `,
      params: splitParams,
    });
    return;
  }

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
