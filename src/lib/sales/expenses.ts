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

type MoneyForwardCategory = {
  id: number;
  name: string;
  group: string | null;
  color: string | null;
};

type MoneyForwardRule = {
  pattern: string;
  matchType: string;
  categoryId: number;
};

const mapMoneyForwardCategory = (categoryName: string): ExpenseCategoryId => {
  if (categoryName === '広告費') return 'advertising';
  if (categoryName === '外注費') return 'outsourcing';
  if (categoryName === 'SaaS' || categoryName === '通信費') return 'system';
  if (categoryName === 'ATM・手数料') return 'payment_fee';
  if (categoryName === 'コンサル・講座参加費') return 'class_cost';
  return 'other';
};

export async function getMoneyForwardExpenses(
  startDate: string,
  endDate: string,
): Promise<SalesExpense[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const [transactionsResult, categoriesResult, rulesResult, overridesResult] = await Promise.all([
    client.query({
      query: `
        SELECT
          t.id AS transaction_id,
          CAST(t.mf_id AS STRING) AS mf_id,
          CAST(t.date AS STRING) AS expense_date,
          t.amount,
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
    }),
    client.query({
      query: `
        SELECT id, name, \`group\`, color
        FROM \`${PROJECT_ID}.moneyforward.custom_categories\`
      `,
    }),
    client.query({
      query: `
        SELECT
          pattern,
          match_type,
          custom_category_id
        FROM \`${PROJECT_ID}.moneyforward.classification_rules\`
        WHERE is_active = TRUE
        ORDER BY priority DESC
      `,
    }),
    client.query({
      query: `
        SELECT transaction_id, custom_category_id
        FROM \`${PROJECT_ID}.moneyforward.transaction_category_overrides\`
      `,
    }),
  ]);

  const categories = new Map(
    (categoriesResult[0] as Array<Record<string, unknown>>).map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        name: String(row.name ?? '不明'),
        group: row.group == null ? null : String(row.group),
        color: row.color == null ? null : String(row.color),
      } satisfies MoneyForwardCategory,
    ]),
  );
  const rules = (rulesResult[0] as Array<Record<string, unknown>>).map((row) => {
    const rule: MoneyForwardRule & { regex: RegExp | null } = {
      pattern: String(row.pattern ?? ''),
      matchType: String(row.match_type ?? ''),
      categoryId: Number(row.custom_category_id),
      regex: null,
    };
    if (rule.matchType === 'regex') {
      try {
        rule.regex = new RegExp(rule.pattern, 'i');
      } catch {
        rule.regex = null;
      }
    }
    return rule;
  });
  const overrides = new Map(
    (overridesResult[0] as Array<Record<string, unknown>>)
      .filter((row) => row.custom_category_id != null)
      .map((row) => [Number(row.transaction_id), Number(row.custom_category_id)]),
  );

  return (transactionsResult[0] as Array<Record<string, unknown>>).flatMap((row) => {
    const transactionId = Number(row.transaction_id);
    const description = String(row.description ?? '');
    let categoryId = overrides.get(transactionId);

    if (categoryId == null && description) {
      const descriptionLower = description.toLowerCase();
      const matchingRule = rules.find((rule) =>
        rule.matchType === 'contains'
          ? descriptionLower.includes(rule.pattern.toLowerCase())
          : rule.matchType === 'regex' && rule.regex
            ? rule.regex.test(description)
            : false,
      );
      categoryId = matchingRule?.categoryId;
    }

    const customCategory = categoryId == null ? null : categories.get(categoryId);
    const isIncluded =
      customCategory?.group === '事業' ||
      (customCategory?.group === '個人' && customCategory.name === '家賃');
    if (!customCategory || !isIncluded) return [];

    return [{
      id: `moneyforward:${String(row.mf_id)}`,
      amount: Number(row.amount),
      category: mapMoneyForwardCategory(customCategory.name),
      expenseType: 'operating' as const,
      businessUnit: 'shared' as const,
      description,
      expenseDate: String(row.expense_date),
      createdAt: '',
      source: 'moneyforward' as const,
      sourceCategory: customCategory.name,
      sourceGroup: customCategory.group ?? undefined,
      sourceColor: customCategory.color ?? undefined,
      sourceAccount: String(row.account_name ?? 'MoneyForward'),
    }];
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
