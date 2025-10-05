import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from '@/lib/bigquery';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

// ファネル分析のデータ型
export interface FunnelAnalysis {
  lineRegistration: number;
  surveyEntered: number;
  surveyCompleted: number;
  surveyEnteredCVR: number;
  surveyCompletedCVR: number;
}

// 日別登録数のデータ型
export interface DailyRegistration {
  date: string;
  count: number;
  previousDayChange: number | null;
  previousDayChangePercent: number | null;
}

// 流入経路分析のデータ型
export interface SourceAnalysis {
  threads: number;
  threadsPercent: number;
  instagram: number;
  instagramPercent: number;
  youtube: number;
  youtubePercent: number;
  other: number;
  otherPercent: number;
  organic: number;
  organicPercent: number;
}

// 属性分析のデータ型
export interface AttributeAnalysis {
  age: Array<{ label: string; count: number; percent: number }>;
  job: Array<{ label: string; count: number; percent: number }>;
  currentRevenue: Array<{ label: string; count: number; percent: number }>;
  goalRevenue: Array<{ label: string; count: number; percent: number }>;
}

export interface LstepAnalyticsData {
  funnel: FunnelAnalysis;
  dailyRegistrations: DailyRegistration[];
  sources: SourceAnalysis;
  attributes: AttributeAnalysis;
  latestSnapshotDate: string | null;
}

/**
 * Lstep分析データを取得
 */
export async function getLstepAnalytics(projectId: string): Promise<LstepAnalyticsData> {
  const datasetId = DEFAULT_DATASET;
  if (!datasetId) {
    throw new Error('Lstep用の BigQuery データセット名が取得できません (LSTEP_BQ_DATASET)');
  }

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  // 最新のスナップショット日付を取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const latestSnapshotDate = latestSnapshot?.snapshot_date ?? null;

  if (!latestSnapshotDate) {
    return {
      funnel: {
        lineRegistration: 0,
        surveyEntered: 0,
        surveyCompleted: 0,
        surveyEnteredCVR: 0,
        surveyCompletedCVR: 0,
      },
      dailyRegistrations: [],
      sources: {
        threads: 0,
        threadsPercent: 0,
        instagram: 0,
        instagramPercent: 0,
        youtube: 0,
        youtubePercent: 0,
        other: 0,
        otherPercent: 0,
        organic: 0,
        organicPercent: 0,
      },
      attributes: {
        age: [],
        job: [],
        currentRevenue: [],
        goalRevenue: [],
      },
      latestSnapshotDate: null,
    };
  }

  // ファネル分析データを取得
  const funnel = await getFunnelAnalysis(client, projectId, datasetId, latestSnapshotDate);

  // 日別登録数を取得
  const dailyRegistrations = await getDailyRegistrations(client, projectId, datasetId);

  // 流入経路分析を取得
  const sources = await getSourceAnalysis(client, projectId, datasetId, latestSnapshotDate);

  // 属性分析を取得
  const attributes = await getAttributeAnalysis(client, projectId, datasetId, latestSnapshotDate);

  return {
    funnel,
    dailyRegistrations,
    sources,
    attributes,
    latestSnapshotDate,
  };
}

/**
 * ファネル分析データを取得
 */
async function getFunnelAnalysis(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
): Promise<FunnelAnalysis> {
  const [row] = await runQuery<{
    total_users: number;
    survey_entered: number;
    survey_completed: number;
  }>(client, projectId, datasetId, {
    query: `
      SELECT
        COUNT(DISTINCT id) AS total_users,
        SUM(survey_form_inflow) AS survey_entered,
        SUM(survey_completed) AS survey_completed
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
    `,
    params: { snapshotDate },
  });

  const totalUsers = Number(row?.total_users ?? 0);
  const surveyEntered = Number(row?.survey_entered ?? 0);
  const surveyCompleted = Number(row?.survey_completed ?? 0);

  return {
    lineRegistration: totalUsers,
    surveyEntered,
    surveyCompleted,
    surveyEnteredCVR: totalUsers > 0 ? (surveyEntered / totalUsers) * 100 : 0,
    surveyCompletedCVR: surveyEntered > 0 ? (surveyCompleted / surveyEntered) * 100 : 0,
  };
}

/**
 * 日別登録数を取得
 */
async function getDailyRegistrations(
  client: BigQuery,
  projectId: string,
  datasetId: string,
): Promise<DailyRegistration[]> {
  const rows = await runQuery<{ snapshot_date: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        CAST(snapshot_date AS STRING) AS snapshot_date,
        COUNT(DISTINCT id) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
      LIMIT 30
    `,
  });

  const sorted = rows.reverse();

  return sorted.map((row, index) => {
    const previousDayCount = index > 0 ? sorted[index - 1].count : null;
    const change = previousDayCount !== null ? row.count - previousDayCount : null;
    const changePercent =
      previousDayCount !== null && previousDayCount > 0 ? (change! / previousDayCount) * 100 : null;

    return {
      date: row.snapshot_date,
      count: Number(row.count),
      previousDayChange: change,
      previousDayChangePercent: changePercent,
    };
  });
}

/**
 * 流入経路分析を取得
 */
async function getSourceAnalysis(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
): Promise<SourceAnalysis> {
  const [row] = await runQuery<{
    total: number;
    threads: number;
    instagram: number;
    youtube: number;
    organic: number;
  }>(client, projectId, datasetId, {
    query: `
      SELECT
        COUNT(DISTINCT id) AS total,
        SUM(source_threads) AS threads,
        SUM(source_instagram) AS instagram,
        SUM(IFNULL(source_youtube, 0)) AS youtube,
        SUM(inflow_organic) AS organic
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
    `,
    params: { snapshotDate },
  });

  const total = Number(row?.total ?? 0);
  const threads = Number(row?.threads ?? 0);
  const instagram = Number(row?.instagram ?? 0);
  const youtube = Number(row?.youtube ?? 0);
  const organic = Number(row?.organic ?? 0);
  const other = Math.max(0, total - threads - instagram - youtube - organic);

  return {
    threads,
    threadsPercent: total > 0 ? (threads / total) * 100 : 0,
    instagram,
    instagramPercent: total > 0 ? (instagram / total) * 100 : 0,
    youtube,
    youtubePercent: total > 0 ? (youtube / total) * 100 : 0,
    other,
    otherPercent: total > 0 ? (other / total) * 100 : 0,
    organic,
    organicPercent: total > 0 ? (organic / total) * 100 : 0,
  };
}

/**
 * 属性分析を取得
 */
async function getAttributeAnalysis(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
): Promise<AttributeAnalysis> {
  // 年齢層
  const ageRows = await runQuery<{ age_group: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '20代' AS age_group,
        SUM(\`20s\`) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '30代' AS age_group,
        SUM(\`30s\`) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '40代' AS age_group,
        SUM(\`40s\`) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50代' AS age_group,
        SUM(\`50s\`) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '60代' AS age_group,
        SUM(\`60s\`) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      ORDER BY age_group
    `,
    params: { snapshotDate },
  });

  const totalAge = ageRows.reduce((sum, row) => sum + Number(row.count), 0);
  const age = ageRows.map((row) => ({
    label: row.age_group,
    count: Number(row.count),
    percent: totalAge > 0 ? (Number(row.count) / totalAge) * 100 : 0,
  }));

  // 職業
  const jobRows = await runQuery<{ job_type: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '会社員' AS job_type,
        SUM(job_employee) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        'フリーランス' AS job_type,
        SUM(job_freelance) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '経営者' AS job_type,
        SUM(job_business_owner) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '主婦' AS job_type,
        SUM(job_housewife) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '学生' AS job_type,
        SUM(job_student) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
    `,
    params: { snapshotDate },
  });

  const totalJob = jobRows.reduce((sum, row) => sum + Number(row.count), 0);
  const job = jobRows.map((row) => ({
    label: row.job_type,
    count: Number(row.count),
    percent: totalJob > 0 ? (Number(row.count) / totalJob) * 100 : 0,
  }));

  // 現在の売上
  const revenueRows = await runQuery<{ revenue_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '0円' AS revenue_range,
        SUM(revenue_m0yen) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1-10万' AS revenue_range,
        SUM(revenue_m1to10man) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '10-50万' AS revenue_range,
        SUM(revenue_m10to50man) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50-100万' AS revenue_range,
        SUM(revenue_m50to100man) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '100-500万' AS revenue_range,
        SUM(revenue_m100to500man) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '500-1000万' AS revenue_range,
        SUM(revenue_m500to1000man) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1000万over' AS revenue_range,
        SUM(revenue_m1000manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
    `,
    params: { snapshotDate },
  });

  const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.count), 0);
  const currentRevenue = revenueRows.map((row) => ({
    label: row.revenue_range,
    count: Number(row.count),
    percent: totalRevenue > 0 ? (Number(row.count) / totalRevenue) * 100 : 0,
  }));

  // 目標売上
  const goalRows = await runQuery<{ goal_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '10万over' AS goal_range,
        SUM(goal_m10manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50万over' AS goal_range,
        SUM(goal_m50manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '100万over' AS goal_range,
        SUM(goal_m100manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '300万over' AS goal_range,
        SUM(goal_m300manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '500万over' AS goal_range,
        SUM(goal_m500manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1000万over' AS goal_range,
        SUM(goal_m1000manover) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
    `,
    params: { snapshotDate },
  });

  const totalGoal = goalRows.reduce((sum, row) => sum + Number(row.count), 0);
  const goalRevenue = goalRows.map((row) => ({
    label: row.goal_range,
    count: Number(row.count),
    percent: totalGoal > 0 ? (Number(row.count) / totalGoal) * 100 : 0,
  }));

  return {
    age,
    job,
    currentRevenue,
    goalRevenue,
  };
}

interface QueryOptions {
  query: string;
  params?: Record<string, unknown>;
}

async function runQuery<T extends Record<string, unknown>>(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  options: QueryOptions,
): Promise<T[]> {
  const [rows] = await client.query({
    query: options.query,
    params: options.params,
    useLegacySql: false,
    defaultDataset: {
      projectId,
      datasetId,
    },
  });

  return rows as T[];
}
