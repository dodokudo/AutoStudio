import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export type AgencyRewardMode = 'performance' | 'list';

export type AgencyRewardRule = {
  agency: string;
  mode: AgencyRewardMode;
  listRewardUnit: number;
  performanceRewardUnit: number;
  revenueUnit: number;
  updatedAt: string | null;
};

export type AgencyRewardRuleInput = {
  agency: string;
  mode: AgencyRewardMode;
  listRewardUnit?: number;
  performanceRewardUnit?: number;
  revenueUnit?: number;
};

const DATASET_ID = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_ID = 'agency_reward_settings';

export const DEFAULT_AGENCY_REWARD_RULE = {
  mode: 'list' as AgencyRewardMode,
  listRewardUnit: 500,
  performanceRewardUnit: 20000,
  revenueUnit: 100000,
};

type RawAgencyRewardRule = {
  agency: string;
  mode: string | null;
  list_reward_unit: number | string | null;
  performance_reward_unit: number | string | null;
  revenue_unit: number | string | null;
  updated_at: { value?: string } | string | null;
};

function tableName(projectId: string): string {
  return `\`${projectId}.${DATASET_ID}.${TABLE_ID}\``;
}

function normalizeMode(value: unknown): AgencyRewardMode {
  return value === 'performance' ? 'performance' : 'list';
}

function normalizeMoney(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : fallback;
}

function toTimestampText(value: RawAgencyRewardRule['updated_at']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.value ?? null;
}

export function getDefaultAgencyRewardRule(agency: string): AgencyRewardRule {
  return {
    agency,
    ...DEFAULT_AGENCY_REWARD_RULE,
    updatedAt: null,
  };
}

function normalizeRule(row: RawAgencyRewardRule): AgencyRewardRule {
  const fallback = getDefaultAgencyRewardRule(row.agency);
  return {
    agency: row.agency,
    mode: normalizeMode(row.mode),
    listRewardUnit: normalizeMoney(row.list_reward_unit, fallback.listRewardUnit),
    performanceRewardUnit: normalizeMoney(row.performance_reward_unit, fallback.performanceRewardUnit),
    revenueUnit: normalizeMoney(row.revenue_unit, fallback.revenueUnit),
    updatedAt: toTimestampText(row.updated_at),
  };
}

async function ensureAgencyRewardSettingsTable(projectId: string) {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  await client.query({
    query: `
      CREATE TABLE IF NOT EXISTS ${tableName(projectId)} (
        agency STRING NOT NULL,
        mode STRING NOT NULL,
        list_reward_unit INT64 NOT NULL,
        performance_reward_unit INT64 NOT NULL,
        revenue_unit INT64 NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
      CLUSTER BY agency
    `,
  });
}

export async function getAgencyRewardSettings(agencies: string[]): Promise<Record<string, AgencyRewardRule>> {
  const uniqueAgencies = Array.from(new Set(agencies.map((agency) => agency.trim()).filter(Boolean)));
  const defaults = Object.fromEntries(uniqueAgencies.map((agency) => [agency, getDefaultAgencyRewardRule(agency)]));

  if (uniqueAgencies.length === 0) return defaults;

  const projectId = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID);
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  try {
    await ensureAgencyRewardSettingsTable(projectId);
    const [rows] = await client.query({
      query: `
        SELECT agency, mode, list_reward_unit, performance_reward_unit, revenue_unit, updated_at
        FROM ${tableName(projectId)}
        WHERE agency IN UNNEST(@agencies)
      `,
      params: { agencies: uniqueAgencies },
    });

    for (const row of rows as RawAgencyRewardRule[]) {
      defaults[row.agency] = normalizeRule(row);
    }
  } catch (error) {
    console.error('[agencyRewards] Failed to load reward settings:', error);
  }

  return defaults;
}

export async function saveAgencyRewardSetting(input: AgencyRewardRuleInput): Promise<AgencyRewardRule> {
  const agency = input.agency.trim();
  if (!agency) throw new Error('agency is required');

  const rule: AgencyRewardRule = {
    agency,
    mode: normalizeMode(input.mode),
    listRewardUnit: normalizeMoney(input.listRewardUnit, DEFAULT_AGENCY_REWARD_RULE.listRewardUnit),
    performanceRewardUnit: normalizeMoney(input.performanceRewardUnit, DEFAULT_AGENCY_REWARD_RULE.performanceRewardUnit),
    revenueUnit: normalizeMoney(input.revenueUnit, DEFAULT_AGENCY_REWARD_RULE.revenueUnit),
    updatedAt: null,
  };

  const projectId = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID);
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  await ensureAgencyRewardSettingsTable(projectId);
  await client.query({
    query: `
      MERGE ${tableName(projectId)} T
      USING (
        SELECT
          @agency AS agency,
          @mode AS mode,
          @listRewardUnit AS list_reward_unit,
          @performanceRewardUnit AS performance_reward_unit,
          @revenueUnit AS revenue_unit,
          CURRENT_TIMESTAMP() AS updated_at
      ) S
      ON T.agency = S.agency
      WHEN MATCHED THEN UPDATE SET
        mode = S.mode,
        list_reward_unit = S.list_reward_unit,
        performance_reward_unit = S.performance_reward_unit,
        revenue_unit = S.revenue_unit,
        updated_at = S.updated_at
      WHEN NOT MATCHED THEN INSERT (
        agency,
        mode,
        list_reward_unit,
        performance_reward_unit,
        revenue_unit,
        updated_at
      ) VALUES (
        S.agency,
        S.mode,
        S.list_reward_unit,
        S.performance_reward_unit,
        S.revenue_unit,
        S.updated_at
      );
    `,
    params: {
      agency: rule.agency,
      mode: rule.mode,
      listRewardUnit: rule.listRewardUnit,
      performanceRewardUnit: rule.performanceRewardUnit,
      revenueUnit: rule.revenueUnit,
    },
  });

  const [rows] = await client.query({
    query: `
      SELECT agency, mode, list_reward_unit, performance_reward_unit, revenue_unit, updated_at
      FROM ${tableName(projectId)}
      WHERE agency = @agency
      LIMIT 1
    `,
    params: { agency },
  });

  const saved = (rows as RawAgencyRewardRule[])[0];
  return saved ? normalizeRule(saved) : { ...rule, updatedAt: null };
}

export function calculateAgencyReward(
  row: { qualifiedListRewards: number; purchasesWithin30Days: number },
  rule: AgencyRewardRule,
) {
  const revenue = row.purchasesWithin30Days * rule.revenueUnit;
  const payout =
    rule.mode === 'performance'
      ? row.purchasesWithin30Days * rule.performanceRewardUnit
      : row.qualifiedListRewards * rule.listRewardUnit;
  const profit = revenue - payout;

  return {
    revenue,
    payout,
    profit,
    roas: payout > 0 ? revenue / payout : null,
    profitRate: revenue > 0 ? profit / revenue : null,
  };
}
