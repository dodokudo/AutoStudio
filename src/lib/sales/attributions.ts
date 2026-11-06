import { createBigQueryClient, resolveProjectId } from '../bigquery';
import type { SalesAttribution } from './commissions';

const tableId = `${resolveProjectId()}.autostudio_sales.sales_attributions`;

export async function getSalesAttributions(): Promise<SalesAttribution[]> {
  try {
    const [rows] = await createBigQueryClient().query({ query: `SELECT revenue_key, referral_status, referrer_name, salesperson_status, salesperson_name FROM \`${tableId}\`` });
    return rows.map((row) => ({ revenueKey: row.revenue_key, referralStatus: row.referral_status,
      referrerName: row.referrer_name, salespersonStatus: row.salesperson_status, salespersonName: row.salesperson_name }));
  } catch (error) {
    if ((error as { code?: number }).code === 404) return [];
    throw error;
  }
}

export async function saveSalesAttribution(row: SalesAttribution) {
  const client = createBigQueryClient();
  const type = row.revenueKey.slice(0, row.revenueKey.indexOf(':'));
  const id = row.revenueKey.slice(row.revenueKey.indexOf(':') + 1);
  const project = resolveProjectId();
  const [sales] = await client.query({ query: type === 'charge'
    ? `SELECT id FROM \`${project}.autostudio_sales.charges\` WHERE id = @id AND mode = 'live' AND status = 'successful'`
    : `SELECT id FROM \`${project}.autostudio_sales.manual_sales\` WHERE id = @id UNION ALL SELECT split_id AS id FROM \`${project}.autostudio_sales.manual_sale_splits\` WHERE split_id = @id`, params: { id } });
  if (!sales.length) throw new Error('Sale not found');
  await client.query({ query: `CREATE TABLE IF NOT EXISTS \`${tableId}\` (
    revenue_key STRING NOT NULL, referral_status STRING, referrer_name STRING,
    salesperson_status STRING, salesperson_name STRING, updated_at TIMESTAMP)` });
  await client.query({ query: `MERGE \`${tableId}\` T USING (SELECT @revenueKey revenue_key) S ON T.revenue_key = S.revenue_key
    WHEN MATCHED THEN UPDATE SET referral_status = @referralStatus, referrer_name = @referrerName,
      salesperson_status = @salespersonStatus, salesperson_name = @salespersonName, updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT VALUES (@revenueKey, @referralStatus, @referrerName, @salespersonStatus, @salespersonName, CURRENT_TIMESTAMP())`,
    params: { ...row, referrerName: row.referralStatus === 'assigned' ? row.referrerName.trim() : '',
      salespersonName: row.salespersonStatus === 'assigned' ? row.salespersonName.trim() : '' } });
}
