import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export interface BankBalance {
  bank: string;
  amount: number | null;
  updatedAt: string | null;
  status: string | null;
}

export async function getBankBalances(): Promise<BankBalance[]> {
  const projectId = resolveProjectId();
  const client = createBigQueryClient(projectId);
  const [rows] = await client.query({
    query: `
      WITH latest_status AS (
        SELECT account_id, total_assets, last_updated, status
        FROM \`${projectId}.moneyforward.account_statuses\`
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY account_id ORDER BY updated_at DESC, id DESC
        ) = 1
      )
      SELECT a.name AS bank, s.total_assets AS amount,
        s.last_updated AS updated_at, s.status
      FROM \`${projectId}.moneyforward.accounts\` a
      JOIN \`${projectId}.moneyforward.institution_categories\` c ON c.id = a.category_id
      LEFT JOIN latest_status s ON s.account_id = a.id
      WHERE a.is_active = TRUE AND c.name = '銀行'
      ORDER BY a.name, a.id
    `,
  });
  return (rows as Record<string, unknown>[]).map((row) => ({
    bank: String(row.bank),
    amount: row.amount == null ? null : Number(row.amount),
    // MoneyForward stores this bank update time as a timezone-less JST string.
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
    status: row.status == null ? null : String(row.status),
  }));
}
