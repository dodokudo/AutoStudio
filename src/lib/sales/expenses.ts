import { createBigQueryClient, resolveProjectId } from '../bigquery';
import type {
  ExpenseBusinessUnitId,
  ExpenseCategoryId,
  ExpenseTypeId,
  SalesExpense,
} from './expenseTypes';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';
const TABLE = 'expenses';

async function ensureExpensesTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const table = client.dataset(DATASET).table(TABLE);
  const [exists] = await table.exists();
  if (exists) return;

  try {
    await table.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'amount', type: 'INTEGER', mode: 'REQUIRED' },
          { name: 'category', type: 'STRING', mode: 'REQUIRED' },
          { name: 'expense_type', type: 'STRING', mode: 'REQUIRED' },
          { name: 'business_unit', type: 'STRING', mode: 'REQUIRED' },
          { name: 'description', type: 'STRING' },
          { name: 'expense_date', type: 'DATE', mode: 'REQUIRED' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'deleted_at', type: 'TIMESTAMP' },
        ],
      },
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 409) throw error;
  }
}

export async function getExpenses(startDate: string, endDate: string): Promise<SalesExpense[]> {
  await ensureExpensesTable();
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        id,
        amount,
        category,
        expense_type,
        business_unit,
        description,
        CAST(expense_date AS STRING) AS expense_date,
        CAST(created_at AS STRING) AS created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE expense_date BETWEEN @startDate AND @endDate
        AND deleted_at IS NULL
      ORDER BY expense_date DESC, created_at DESC
    `,
    params: { startDate, endDate },
  });

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    category: String(row.category) as ExpenseCategoryId,
    expenseType: String(row.expense_type) as ExpenseTypeId,
    businessUnit: String(row.business_unit) as ExpenseBusinessUnitId,
    description: String(row.description ?? ''),
    expenseDate: String(row.expense_date),
    createdAt: String(row.created_at),
    source: 'manual',
  }));
}

const inferMoneyForwardCategory = (
  category: string,
  subCategory: string,
  description: string,
): ExpenseCategoryId => {
  const value = `${category} ${subCategory} ${description}`.toLocaleLowerCase('ja-JP');
  if (/広告|meta|facebook|instagram|google ads|tiktok ads/.test(value)) return 'advertising';
  if (/決済手数料|振込手数料|atm 利用手数料/.test(value)) return 'payment_fee';
  if (/講師|授業/.test(value)) return 'class_cost';
  if (/外注|業務委託/.test(value)) return 'outsourcing';
  if (/通信|情報サービス|システム|openai|anthropic|vercel|figma|google one/.test(value)) {
    return 'system';
  }
  return 'other';
};

export async function getMoneyForwardExpenses(
  startDate: string,
  endDate: string,
): Promise<SalesExpense[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        CAST(t.mf_id AS STRING) AS mf_id,
        CAST(t.date AS STRING) AS expense_date,
        t.amount,
        COALESCE(t.category, '未分類') AS category,
        COALESCE(t.sub_category, '未分類') AS sub_category,
        COALESCE(t.description, '') AS description,
        COALESCE(a.name, a.institution, 'MoneyForward') AS account_name
      FROM \`${PROJECT_ID}.moneyforward.transactions\` t
      LEFT JOIN \`${PROJECT_ID}.moneyforward.accounts\` a
        ON t.account_id = a.id
      WHERE t.date BETWEEN @startDate AND @endDate
        AND t.type = 'expense'
        AND t.is_transfer = FALSE
        AND t.is_excluded_from_calculation = FALSE
      ORDER BY t.date DESC, t.amount DESC
    `,
    params: { startDate, endDate },
  });

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const sourceCategory = [row.category, row.sub_category]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' / ');
    const description = String(row.description ?? '');
    return {
      id: `moneyforward:${String(row.mf_id)}`,
      amount: Number(row.amount),
      category: inferMoneyForwardCategory(
        String(row.category ?? ''),
        String(row.sub_category ?? ''),
        description,
      ),
      expenseType: 'operating',
      businessUnit: 'shared',
      description,
      expenseDate: String(row.expense_date),
      createdAt: '',
      source: 'moneyforward',
      sourceCategory,
      sourceAccount: String(row.account_name ?? 'MoneyForward'),
    };
  });
}

export async function addExpense(input: {
  amount: number;
  category: ExpenseCategoryId;
  expenseType: ExpenseTypeId;
  businessUnit: ExpenseBusinessUnitId;
  description: string;
  expenseDate: string;
}): Promise<SalesExpense> {
  await ensureExpensesTable();
  const client = createBigQueryClient(PROJECT_ID);
  const id = `expense_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  await client.query({
    query: `
      INSERT INTO \`${PROJECT_ID}.${DATASET}.${TABLE}\`
        (id, amount, category, expense_type, business_unit, description, expense_date,
         created_at, updated_at, deleted_at)
      VALUES
        (@id, @amount, @category, @expenseType, @businessUnit, @description,
         DATE(@expenseDate), TIMESTAMP(@createdAt), TIMESTAMP(@createdAt), NULL)
    `,
    params: {
      id,
      amount: input.amount,
      category: input.category,
      expenseType: input.expenseType,
      businessUnit: input.businessUnit,
      description: input.description,
      expenseDate: input.expenseDate,
      createdAt,
    },
  });

  return { id, createdAt, source: 'manual', ...input };
}

export async function deleteExpense(id: string): Promise<void> {
  await ensureExpensesTable();
  const client = createBigQueryClient(PROJECT_ID);
  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      SET deleted_at = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP()
      WHERE id = @id AND deleted_at IS NULL
    `,
    params: { id },
  });
}
