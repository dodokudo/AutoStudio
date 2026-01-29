/**
 * UnivaPay課金データのBigQuery管理
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';
import type { UnivaPayCharge } from '../univapay/client';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';
const TABLE = 'charges';

/**
 * chargesテーブルを初期化
 */
export async function initChargesTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);

  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await dataset.create();
    console.log(`[charges] Created dataset: ${DATASET}`);
  }

  const table = dataset.table(TABLE);
  const [tableExists] = await table.exists();

  if (!tableExists) {
    await table.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'store_id', type: 'STRING' },
          { name: 'transaction_token_id', type: 'STRING' },
          { name: 'requested_amount', type: 'INTEGER' },
          { name: 'requested_currency', type: 'STRING' },
          { name: 'charged_amount', type: 'INTEGER' },
          { name: 'charged_currency', type: 'STRING' },
          { name: 'status', type: 'STRING' },
          { name: 'metadata', type: 'JSON' },
          { name: 'mode', type: 'STRING' },
          { name: 'created_on', type: 'TIMESTAMP' },
          { name: 'descriptor', type: 'STRING' },
          { name: 'error_code', type: 'STRING' },
          { name: 'error_message', type: 'STRING' },
          { name: 'synced_at', type: 'TIMESTAMP' },
        ],
      },
    });
    console.log(`[charges] Created table: ${TABLE}`);
  }
}

/**
 * 課金データをBigQueryに保存（MERGE: 既存は更新、新規は挿入）
 */
export async function upsertCharges(charges: UnivaPayCharge[]): Promise<number> {
  if (charges.length === 0) return 0;

  const client = createBigQueryClient(PROJECT_ID);

  // 一時テーブルにデータを挿入してMERGE
  const tempTableId = `charges_temp_${Date.now()}`;
  const dataset = client.dataset(DATASET);
  const tempTable = dataset.table(tempTableId);

  try {
    // 一時テーブル作成
    await tempTable.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'store_id', type: 'STRING' },
          { name: 'transaction_token_id', type: 'STRING' },
          { name: 'requested_amount', type: 'INTEGER' },
          { name: 'requested_currency', type: 'STRING' },
          { name: 'charged_amount', type: 'INTEGER' },
          { name: 'charged_currency', type: 'STRING' },
          { name: 'status', type: 'STRING' },
          { name: 'metadata', type: 'JSON' },
          { name: 'mode', type: 'STRING' },
          { name: 'created_on', type: 'TIMESTAMP' },
          { name: 'descriptor', type: 'STRING' },
          { name: 'error_code', type: 'STRING' },
          { name: 'error_message', type: 'STRING' },
          { name: 'synced_at', type: 'TIMESTAMP' },
        ],
      },
    });

    // データを変換
    const rows = charges.map(c => ({
      id: c.id,
      store_id: c.store_id,
      transaction_token_id: c.transaction_token_id,
      requested_amount: c.requested_amount,
      requested_currency: c.requested_currency,
      charged_amount: c.charged_amount,
      charged_currency: c.charged_currency,
      status: c.status,
      metadata: c.metadata ? JSON.stringify(c.metadata) : null,
      mode: c.mode,
      created_on: c.created_on,
      descriptor: c.descriptor ?? null,
      error_code: c.error?.code ?? null,
      error_message: c.error?.message ?? null,
      synced_at: new Date().toISOString(),
    }));

    // 一時テーブルにデータ挿入
    await tempTable.insert(rows);

    // MERGEクエリ実行
    await client.query({
      query: `
        MERGE \`${PROJECT_ID}.${DATASET}.${TABLE}\` T
        USING \`${PROJECT_ID}.${DATASET}.${tempTableId}\` S
        ON T.id = S.id
        WHEN MATCHED THEN
          UPDATE SET
            store_id = S.store_id,
            transaction_token_id = S.transaction_token_id,
            requested_amount = S.requested_amount,
            requested_currency = S.requested_currency,
            charged_amount = S.charged_amount,
            charged_currency = S.charged_currency,
            status = S.status,
            metadata = S.metadata,
            mode = S.mode,
            created_on = S.created_on,
            descriptor = S.descriptor,
            error_code = S.error_code,
            error_message = S.error_message,
            synced_at = S.synced_at
        WHEN NOT MATCHED THEN
          INSERT (id, store_id, transaction_token_id, requested_amount, requested_currency,
                  charged_amount, charged_currency, status, metadata, mode, created_on,
                  descriptor, error_code, error_message, synced_at)
          VALUES (S.id, S.store_id, S.transaction_token_id, S.requested_amount, S.requested_currency,
                  S.charged_amount, S.charged_currency, S.status, S.metadata, S.mode, S.created_on,
                  S.descriptor, S.error_code, S.error_message, S.synced_at)
      `,
    });

    return charges.length;
  } finally {
    // 一時テーブル削除
    try {
      await tempTable.delete();
    } catch {
      // 削除失敗は無視
    }
  }
}

/**
 * BigQueryから課金データを取得
 */
export async function getChargesFromBigQuery(
  startDate: string,
  endDate: string,
): Promise<UnivaPayCharge[]> {
  const client = createBigQueryClient(PROJECT_ID);

  const [rows] = await client.query({
    query: `
      SELECT
        id,
        store_id,
        transaction_token_id,
        requested_amount,
        requested_currency,
        charged_amount,
        charged_currency,
        status,
        metadata,
        mode,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S+09:00', created_on, 'Asia/Tokyo') as created_on,
        descriptor,
        error_code,
        error_message
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE created_on >= TIMESTAMP(@startDate)
        AND created_on <= TIMESTAMP(@endDate)
        AND mode = 'live'
      ORDER BY created_on DESC
    `,
    params: { startDate, endDate },
  });

  return (rows as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    store_id: String(row.store_id),
    transaction_token_id: String(row.transaction_token_id),
    requested_amount: Number(row.requested_amount),
    requested_currency: String(row.requested_currency),
    charged_amount: Number(row.charged_amount),
    charged_currency: String(row.charged_currency),
    status: String(row.status) as UnivaPayCharge['status'],
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
    mode: String(row.mode) as 'live' | 'test',
    created_on: String(row.created_on),
    descriptor: row.descriptor ? String(row.descriptor) : undefined,
    error: row.error_code ? {
      code: String(row.error_code),
      message: String(row.error_message ?? ''),
    } : undefined,
  }));
}

/**
 * 最新の同期日時を取得
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const client = createBigQueryClient(PROJECT_ID);

  try {
    const [rows] = await client.query({
      query: `
        SELECT MAX(synced_at) as last_synced_at
        FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      `,
    });

    const row = (rows as Array<{ last_synced_at: { value: string } | null }>)[0];
    if (row?.last_synced_at?.value) {
      return new Date(row.last_synced_at.value);
    }
    return null;
  } catch {
    return null;
  }
}
