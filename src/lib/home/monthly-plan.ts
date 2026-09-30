import { createBigQueryClient, resolveProjectId } from '../bigquery';
import { emptyMonthlyPlan, validateMonthlyPlan, type MonthlyPlan } from './monthly-plan-types';

const table = `${resolveProjectId()}.autostudio_home.monthly_plans`;
let initialized: Promise<void> | undefined;
async function ensureTable() {
  initialized ??= (async () => {
    const client = createBigQueryClient(undefined, 'US');
    await client.query({
      query: `CREATE TABLE IF NOT EXISTS \`${table}\` (month STRING, revision INT64, payload STRING, updated_at TIMESTAMP)`,
    });
  })().catch((error) => {
    initialized = undefined;
    throw error;
  });
  return initialized;
}
export async function getMonthlyPlan(month: string): Promise<MonthlyPlan> {
  await ensureTable();
  const [rows] = await createBigQueryClient(undefined, 'US').query({
    query: `SELECT payload, revision FROM \`${table}\` WHERE month = @month ORDER BY revision DESC LIMIT 1`,
    params: { month },
  });
  if (!rows.length) return emptyMonthlyPlan(month);
  return { ...JSON.parse(rows[0].payload), month, revision: Number(rows[0].revision) };
}
export async function saveMonthlyPlan(plan: MonthlyPlan): Promise<MonthlyPlan> {
  const error = validateMonthlyPlan(plan);
  if (error) throw new Error(error);
  await ensureTable();
  const saved = { ...plan, revision: plan.revision + 1 };
  const [rows] = await createBigQueryClient(undefined, 'US').query({
    query: `
      MERGE \`${table}\` T USING (SELECT @month AS month) S ON T.month = S.month
      WHEN MATCHED AND T.revision = @revision THEN UPDATE SET payload = @payload, revision = @revision + 1, updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED AND @revision = 0 THEN INSERT (month, revision, payload, updated_at) VALUES (@month, 1, @payload, CURRENT_TIMESTAMP());
      SELECT @@row_count AS changed;
    `,
    params: { month: plan.month, revision: plan.revision, payload: JSON.stringify(saved) },
  });
  if (Number(rows[0]?.changed) !== 1) throw new Error('別の画面で更新されています。再読み込みしてから保存してください');
  return saved;
}
