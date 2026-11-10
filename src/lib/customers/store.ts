import { createBigQueryClient, resolveProjectId } from '../bigquery';

// Keep editable customer records separate from financial source tables.
const table = () => `${resolveProjectId()}.autostudio_sales.customer_management`;
let initialized: Promise<void> | undefined;
async function initialize() {
  initialized ??= createBigQueryClient().query({
    query: `CREATE TABLE IF NOT EXISTS \`${table()}\` (
      namespace STRING NOT NULL, record_id STRING NOT NULL,
      payload STRING NOT NULL, updated_at TIMESTAMP NOT NULL
    )`,
  }).then(() => undefined).catch(error => {
    initialized = undefined;
    throw error;
  });
  await initialized;
}

export async function readCustomerRecords<T>(namespace: string): Promise<Record<string, T>> {
  await initialize();
  const [rows] = await createBigQueryClient().query({
    query: `SELECT record_id, payload FROM \`${table()}\` WHERE namespace = @namespace`,
    params: { namespace },
  });
  return Object.fromEntries(rows.map(row => [row.record_id, JSON.parse(row.payload) as T]));
}

export async function writeCustomerRecord(namespace: string, id: string, value: unknown): Promise<void> {
  await initialize();
  await createBigQueryClient().query({
    query: `MERGE \`${table()}\` T
      USING (SELECT @namespace namespace, @id record_id, @payload payload) S
      ON T.namespace = S.namespace AND T.record_id = S.record_id
      WHEN MATCHED THEN UPDATE SET payload = S.payload, updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (namespace, record_id, payload, updated_at)
        VALUES (S.namespace, S.record_id, S.payload, CURRENT_TIMESTAMP())`,
    params: { namespace, id, payload: JSON.stringify(value) },
  });
}
