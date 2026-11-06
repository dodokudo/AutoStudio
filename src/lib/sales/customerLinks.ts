import { createBigQueryClient, resolveProjectId } from '../bigquery';
import { assessPaymentTag, mergeCustomerLink, type PaymentTag, type SalesCustomerLink } from './customerIdentity';

const table = `${resolveProjectId()}.autostudio_sales.sales_customer_links`;
export async function getSalesCustomerLinks(): Promise<SalesCustomerLink[]> {
  try {
    const [rows] = await createBigQueryClient().query({ query: `SELECT payload FROM \`${table}\`` });
    return rows.map(row => JSON.parse(row.payload) as SalesCustomerLink);
  } catch (error) {
    if ((error as { code?: number }).code === 404) return [];
    throw error;
  }
}
export async function getPaymentTags(): Promise<PaymentTag[]> {
  const [rows] = await createBigQueryClient().query({ query: `SELECT user_id, payment_method, classification_status, source_complete, CAST(snapshot_date AS STRING) snapshot_date FROM \`${resolveProjectId()}.autostudio_lstep.user_payment_methods\`` });
  return rows.map(row => ({ userId: String(row.user_id), paymentMethod: row.payment_method ?? '',
    classificationStatus: row.classification_status, sourceComplete: row.source_complete === true, snapshotDate: row.snapshot_date }));
}
export async function getCurrentSalesCustomerLinks(): Promise<SalesCustomerLink[]> {
  const links = await getSalesCustomerLinks();
  if (!links.some(row => row.lstepId)) return links;
  try {
    const tags = await getPaymentTags();
    return links.map(link => {
      if (!link.lstepId) return link;
      const paymentTag = tags.find(tag => tag.userId === link.lstepId);
      return { ...link, paymentTag, paymentTagReason: assessPaymentTag(paymentTag, '', new Date().toISOString()) };
    });
  } catch {
    return links.map(link => ({ ...link, paymentTag: undefined, paymentTagReason: '支払タグDBを取得できませんでした' }));
  }
}

// Only the correspondence table is writable here. No financial source table is modified.
export async function saveCustomerLinks(rows: SalesCustomerLink[]): Promise<void> {
  if (!rows.length || new Set(rows.map(row => row.revenueKey)).size !== rows.length) throw new Error('Empty or duplicate sales links');
  const client = createBigQueryClient();
  await client.query({ query: `CREATE TABLE IF NOT EXISTS \`${table}\` (revenue_key STRING NOT NULL, payload STRING NOT NULL, updated_at TIMESTAMP)` });
  const [existing] = await client.query({ query: `SELECT revenue_key, payload FROM \`${table}\`` });
  const previous = new Map(existing.map(row => [row.revenue_key, row.payload as string]));
  const changes = rows.map(row => ({ previous: previous.get(row.revenueKey) ?? '',
    link: mergeCustomerLink(previous.has(row.revenueKey) ? JSON.parse(previous.get(row.revenueKey)!) : undefined, row) }));
  await client.query({ query: `MERGE \`${table}\` T USING (
    SELECT JSON_VALUE(item, '$.link.revenueKey') revenue_key, JSON_QUERY(item, '$.link') payload,
      JSON_VALUE(item, '$.previous') previous FROM UNNEST(JSON_EXTRACT_ARRAY(@payload)) item
  ) S ON T.revenue_key = S.revenue_key
  WHEN MATCHED AND T.payload = S.previous THEN UPDATE SET payload = S.payload, updated_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED AND S.previous = '' THEN INSERT (revenue_key, payload, updated_at) VALUES (S.revenue_key, S.payload, CURRENT_TIMESTAMP())`, params: { payload: JSON.stringify(changes) } });
}
