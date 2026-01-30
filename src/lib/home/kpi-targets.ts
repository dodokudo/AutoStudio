/**
 * KPI目標管理 - サーバーサイド専用（DB操作）
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';
import type { KpiTargetInput, KpiTarget } from './kpi-types';

// 型定義と計算ユーティリティはkpi-types.tsからre-export
export * from './kpi-types';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_home';
const TABLE = 'kpi_targets';

// ============================================================
// DB操作
// ============================================================

/** テーブル存在確認・作成 */
export async function ensureKpiTargetsTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);

  // データセット作成
  try {
    await dataset.create({ location: 'US' });
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code !== 409) throw err; // 409 = already exists
  }

  // テーブル作成
  const schema = [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'target_month', type: 'STRING', mode: 'REQUIRED' },
    { name: 'working_days', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_revenue', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_line_registrations', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_seminar_participants', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_frontend_purchases', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_backend_purchases', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_threads_followers', type: 'INT64', mode: 'REQUIRED' },
    { name: 'target_instagram_followers', type: 'INT64', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  ];

  try {
    await dataset.createTable(TABLE, { schema });
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code !== 409) throw err;
  }

  await client.query({
    query: `ALTER TABLE \`${PROJECT_ID}.${DATASET}.${TABLE}\` ADD COLUMN IF NOT EXISTS target_threads_followers INT64`,
  });
  await client.query({
    query: `ALTER TABLE \`${PROJECT_ID}.${DATASET}.${TABLE}\` ADD COLUMN IF NOT EXISTS target_instagram_followers INT64`,
  });
}

/** KPI目標を取得 */
export async function getKpiTarget(month: string): Promise<KpiTarget | null> {
  const client = createBigQueryClient(PROJECT_ID);

  const [rows] = await client.query({
    query: `
      SELECT
        id,
        target_month,
        working_days,
        target_revenue,
        target_line_registrations,
        target_seminar_participants,
        target_frontend_purchases,
        target_backend_purchases,
        target_threads_followers,
        target_instagram_followers,
        CAST(created_at AS STRING) as created_at,
        CAST(updated_at AS STRING) as updated_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE target_month = @month
      LIMIT 1
    `,
    params: { month },
  });

  if (!rows || rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    targetMonth: String(row.target_month),
    workingDays: Number(row.working_days),
    targetRevenue: Number(row.target_revenue),
    targetLineRegistrations: Number(row.target_line_registrations),
    targetSeminarParticipants: Number(row.target_seminar_participants),
    targetFrontendPurchases: Number(row.target_frontend_purchases),
    targetBackendPurchases: Number(row.target_backend_purchases),
    targetThreadsFollowers: Number(row.target_threads_followers ?? 0),
    targetInstagramFollowers: Number(row.target_instagram_followers ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** KPI目標を保存（upsert） */
export async function saveKpiTarget(input: KpiTargetInput): Promise<KpiTarget> {
  await ensureKpiTargetsTable();

  const client = createBigQueryClient(PROJECT_ID);
  const id = `kpi_${input.targetMonth}_${Date.now()}`;

  await client.query({
    query: `
      MERGE \`${PROJECT_ID}.${DATASET}.${TABLE}\` T
      USING (
        SELECT
          @id as id,
          @targetMonth as target_month,
          @workingDays as working_days,
          @targetRevenue as target_revenue,
          @targetLineRegistrations as target_line_registrations,
          @targetSeminarParticipants as target_seminar_participants,
          @targetFrontendPurchases as target_frontend_purchases,
          @targetBackendPurchases as target_backend_purchases,
          @targetThreadsFollowers as target_threads_followers,
          @targetInstagramFollowers as target_instagram_followers,
          CURRENT_TIMESTAMP() as created_at,
          CURRENT_TIMESTAMP() as updated_at
      ) S
      ON T.target_month = S.target_month
      WHEN MATCHED THEN
        UPDATE SET
          working_days = S.working_days,
          target_revenue = S.target_revenue,
          target_line_registrations = S.target_line_registrations,
          target_seminar_participants = S.target_seminar_participants,
          target_frontend_purchases = S.target_frontend_purchases,
          target_backend_purchases = S.target_backend_purchases,
          target_threads_followers = S.target_threads_followers,
          target_instagram_followers = S.target_instagram_followers,
          updated_at = S.updated_at
      WHEN NOT MATCHED THEN
        INSERT (id, target_month, working_days, target_revenue, target_line_registrations, target_seminar_participants, target_frontend_purchases, target_backend_purchases, target_threads_followers, target_instagram_followers, created_at, updated_at)
        VALUES (S.id, S.target_month, S.working_days, S.target_revenue, S.target_line_registrations, S.target_seminar_participants, S.target_frontend_purchases, S.target_backend_purchases, S.target_threads_followers, S.target_instagram_followers, S.created_at, S.updated_at)
    `,
    params: {
      id,
      targetMonth: input.targetMonth,
      workingDays: input.workingDays,
      targetRevenue: input.targetRevenue,
      targetLineRegistrations: input.targetLineRegistrations,
      targetSeminarParticipants: input.targetSeminarParticipants,
      targetFrontendPurchases: input.targetFrontendPurchases,
      targetBackendPurchases: input.targetBackendPurchases,
      targetThreadsFollowers: input.targetThreadsFollowers,
      targetInstagramFollowers: input.targetInstagramFollowers,
    },
  });

  // 保存したデータを取得して返す
  const saved = await getKpiTarget(input.targetMonth);
  if (!saved) {
    throw new Error('Failed to save KPI target');
  }
  return saved;
}
