import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';

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
  registrations: number;
  surveyCompleted: number;
  completionRate: number;
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
  gender: Array<{ label: string; count: number; percent: number }>;
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
 * 期間指定でLstep分析データを取得
 */
export async function getLstepAnalyticsByDateRange(
  projectId: string,
  startDate?: string,
  endDate?: string,
): Promise<Omit<LstepAnalyticsData, 'dailyRegistrations'>> {
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
        gender: [],
        age: [],
        job: [],
        currentRevenue: [],
        goalRevenue: [],
      },
      latestSnapshotDate: null,
    };
  }

  // ファネル分析データを取得（期間指定）
  const funnel = await getFunnelAnalysisByDateRange(client, projectId, datasetId, latestSnapshotDate, startDate, endDate);

  // 流入経路分析を取得（期間指定）
  const sources = await getSourceAnalysisByDateRange(client, projectId, datasetId, latestSnapshotDate, startDate, endDate);

  // 属性分析を取得（期間指定）
  const attributes = await getAttributeAnalysisByDateRange(client, projectId, datasetId, latestSnapshotDate, startDate, endDate);

  return {
    funnel,
    sources,
    attributes,
    latestSnapshotDate,
  };
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
        gender: [],
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
        COUNT(DISTINCT CASE WHEN survey_form_inflow = 1 THEN id END) AS survey_entered,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END) AS survey_completed
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
 * ファネル分析データを取得（期間指定）
 */
async function getFunnelAnalysisByDateRange(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
  startDate?: string,
  endDate?: string,
): Promise<FunnelAnalysis> {
  const dateFilter = startDate && endDate
    ? 'AND DATE(friend_added_at) BETWEEN @startDate AND @endDate'
    : '';

  const [row] = await runQuery<{
    total_users: number;
    survey_entered: number;
    survey_completed: number;
  }>(client, projectId, datasetId, {
    query: `
      SELECT
        COUNT(DISTINCT id) AS total_users,
        COUNT(DISTINCT CASE WHEN survey_form_inflow = 1 THEN id END) AS survey_entered,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END) AS survey_completed
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
    `,
    params: { snapshotDate, startDate, endDate },
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
 * 日別登録数を取得（連続した日付で表示）
 */
async function getDailyRegistrations(
  client: BigQuery,
  projectId: string,
  datasetId: string,
): Promise<DailyRegistration[]> {
  // 最新のスナップショット日付を取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const latestSnapshotDate = latestSnapshot?.snapshot_date;
  if (!latestSnapshotDate) {
    return [];
  }

  // 日付範囲を生成し、登録数とアンケート完了数を取得
  const rows = await runQuery<{
    registration_date: string;
    registrations: number;
    survey_completed: number;
  }>(client, projectId, datasetId, {
    query: `
      WITH date_range AS (
        SELECT DATE_SUB(CAST(@latestSnapshotDate AS DATE), INTERVAL n DAY) AS date
        FROM UNNEST(GENERATE_ARRAY(0, 89)) AS n
      ),
      daily_stats AS (
        SELECT
          CAST(DATE(friend_added_at) AS STRING) AS registration_date,
          COUNT(DISTINCT id) AS registrations,
          COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END) AS survey_completed
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE friend_added_at IS NOT NULL
          AND snapshot_date = @latestSnapshotDate
        GROUP BY registration_date
      )
      SELECT
        CAST(dr.date AS STRING) AS registration_date,
        COALESCE(ds.registrations, 0) AS registrations,
        COALESCE(ds.survey_completed, 0) AS survey_completed
      FROM date_range dr
      LEFT JOIN daily_stats ds ON CAST(dr.date AS STRING) = ds.registration_date
      ORDER BY dr.date DESC
    `,
    params: { latestSnapshotDate },
  });

  return rows.map((row) => {
    const registrations = Number(row.registrations);
    const surveyCompleted = Number(row.survey_completed);
    const completionRate = registrations > 0 ? (surveyCompleted / registrations) * 100 : 0;

    return {
      date: row.registration_date,
      registrations,
      surveyCompleted,
      completionRate,
    };
  });
}

/**
 * 流入経路分析を取得（countLineSourceRegistrationsと同じロジック）
 */
async function getSourceAnalysis(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
): Promise<SourceAnalysis> {
  // 各ソースごとにcountLineSourceRegistrationsを使用
  const threads = await countLineSourceRegistrations(projectId, {
    sourceName: 'Threads',
    datasetId,
  });

  const instagram = await countLineSourceRegistrations(projectId, {
    sourceName: 'Instagram',
    datasetId,
  });

  const youtube = await countLineSourceRegistrations(projectId, {
    sourceName: 'Youtube',
    datasetId,
  });

  // OrganicとOGを別々にカウント
  const organic = await countLineSourceRegistrations(projectId, {
    sourceName: 'Organic',
    datasetId,
  });

  const og = await countLineSourceRegistrations(projectId, {
    sourceName: 'OG',
    datasetId,
  });

  const organicTotal = organic + og;
  const matched = threads + instagram + youtube + organicTotal;

  // "その他"を計算するために全体のユーザー数を取得
  const [totalRow] = await runQuery<{ total: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM \`${projectId}.${datasetId}.user_core\`
      WHERE snapshot_date = @snapshotDate
        AND DATE(friend_added_at) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
    `,
    params: { snapshotDate },
  });

  const total = Number(totalRow?.total ?? 0);
  const other = Math.max(0, total - matched);

  return {
    threads,
    threadsPercent: total > 0 ? (threads / total) * 100 : 0,
    instagram,
    instagramPercent: total > 0 ? (instagram / total) * 100 : 0,
    youtube,
    youtubePercent: total > 0 ? (youtube / total) * 100 : 0,
    other,
    otherPercent: total > 0 ? (other / total) * 100 : 0,
    organic: organicTotal,
    organicPercent: total > 0 ? (organicTotal / total) * 100 : 0,
  };
}

/**
 * 流入経路分析を取得（期間指定）
 */
async function getSourceAnalysisByDateRange(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
  startDate?: string,
  endDate?: string,
): Promise<SourceAnalysis> {
  const [threads, instagram, youtube, organic, og] = await Promise.all([
    countLineSourceRegistrations(projectId, {
      sourceName: 'Threads',
      datasetId,
    }),
    countLineSourceRegistrations(projectId, {
      sourceName: 'Instagram',
      datasetId,
    }),
    countLineSourceRegistrations(projectId, {
      sourceName: 'Youtube',
      datasetId,
    }),
    countLineSourceRegistrations(projectId, {
      sourceName: 'Organic',
      datasetId,
    }),
    countLineSourceRegistrations(projectId, {
      sourceName: 'OG',
      datasetId,
    }),
  ]);

  const organicTotal = organic + og;

  const [totalRow] = await runQuery<{ total: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM \`${projectId}.${datasetId}.user_core\`
      WHERE snapshot_date = @snapshotDate
        AND DATE(friend_added_at) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
    `,
    params: { snapshotDate },
  });

  const total = Number(totalRow?.total ?? 0);
  const matched = threads + instagram + youtube + organicTotal;
  const other = Math.max(0, total - matched);

  return {
    threads,
    threadsPercent: total > 0 ? (threads / total) * 100 : 0,
    instagram,
    instagramPercent: total > 0 ? (instagram / total) * 100 : 0,
    youtube,
    youtubePercent: total > 0 ? (youtube / total) * 100 : 0,
    other,
    otherPercent: total > 0 ? (other / total) * 100 : 0,
    organic: organicTotal,
    organicPercent: total > 0 ? (organicTotal / total) * 100 : 0,
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
  const defaultGender = [
    { label: '男性', count: 0, percent: 0 },
    { label: '女性', count: 0, percent: 0 },
  ];
  // 年齢層（アンケート完了者のみ）
  const genderRows = await runQuery<{ gender_male: number; gender_female: number; total: number }>(
    client,
    projectId,
    datasetId,
    {
      query: `
        SELECT
          COUNT(DISTINCT CASE WHEN gender_male = 1 THEN id END) AS gender_male,
          COUNT(DISTINCT CASE WHEN gender_female = 1 THEN id END) AS gender_female,
          COUNT(DISTINCT id) AS total
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE snapshot_date = @snapshotDate
      `,
      params: { snapshotDate },
    },
  );

  const male = Number(genderRows?.[0]?.gender_male ?? 0);
  const female = Number(genderRows?.[0]?.gender_female ?? 0);
  const totalGender = Number(genderRows?.[0]?.total ?? 0);
  const gender = [
    {
      label: '男性',
      count: male,
      percent: totalGender > 0 ? (male / totalGender) * 100 : 0,
    },
    {
      label: '女性',
      count: female,
      percent: totalGender > 0 ? (female / totalGender) * 100 : 0,
    },
  ];

  const ageRows = await runQuery<{ age_group: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '20代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`20s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '30代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`30s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '40代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`40s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`50s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '60代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`60s\` = 1 THEN id END) AS count
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

  // 職業（アンケート完了者のみ）
  const jobRows = await runQuery<{ job_type: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '会社員' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_employee = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        'フリーランス' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_freelance = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '経営者' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_business_owner = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '主婦' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_housewife = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '学生' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_student = 1 THEN id END) AS count
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

  // 現在の売上（アンケート完了者のみ）
  const revenueRows = await runQuery<{ revenue_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '0円' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m0yen = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1-10万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m1to10man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '10-50万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m10to50man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50-100万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m50to100man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '100-500万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m100to500man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '500-1000万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m500to1000man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1000万over' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m1000manover = 1 THEN id END) AS count
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

  // 目標売上（アンケート完了者のみ）
  const goalRows = await runQuery<{ goal_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '10万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m10manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '50万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m50manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '100万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m100manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '300万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m300manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '500万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m500manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
      UNION ALL
      SELECT
        '1000万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m1000manover = 1 THEN id END) AS count
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
    gender,
    age,
    job,
    currentRevenue,
    goalRevenue,
  };
}

/**
 * 属性分析を取得（期間指定）
 */
async function getAttributeAnalysisByDateRange(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
  startDate?: string,
  endDate?: string,
): Promise<AttributeAnalysis> {
  const dateFilter = startDate && endDate
    ? 'AND DATE(friend_added_at) BETWEEN @startDate AND @endDate'
    : '';

  // 性別（期間指定）
  const genderRows = await runQuery<{ gender_male: number; gender_female: number; total: number }>(
    client,
    projectId,
    datasetId,
    {
      query: `
        SELECT
          COUNT(DISTINCT CASE WHEN gender_male = 1 THEN id END) AS gender_male,
          COUNT(DISTINCT CASE WHEN gender_female = 1 THEN id END) AS gender_female,
          COUNT(DISTINCT id) AS total
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE snapshot_date = @snapshotDate
          AND friend_added_at IS NOT NULL
          ${dateFilter}
      `,
      params: { snapshotDate, startDate, endDate },
    },
  );

  const male = Number(genderRows?.[0]?.gender_male ?? 0);
  const female = Number(genderRows?.[0]?.gender_female ?? 0);
  const totalGender = Number(genderRows?.[0]?.total ?? 0);
  const gender = [
    {
      label: '男性',
      count: male,
      percent: totalGender > 0 ? (male / totalGender) * 100 : 0,
    },
    {
      label: '女性',
      count: female,
      percent: totalGender > 0 ? (female / totalGender) * 100 : 0,
    },
  ];

  // 年齢層（アンケート完了者のみ、期間指定）
  const ageRows = await runQuery<{ age_group: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '20代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`20s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '30代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`30s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '40代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`40s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '50代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`50s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '60代' AS age_group,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND \`60s\` = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      ORDER BY age_group
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const totalAge = ageRows.reduce((sum, row) => sum + Number(row.count), 0);
  const age = ageRows.map((row) => ({
    label: row.age_group,
    count: Number(row.count),
    percent: totalAge > 0 ? (Number(row.count) / totalAge) * 100 : 0,
  }));

  // 職業（アンケート完了者のみ、期間指定）
  const jobRows = await runQuery<{ job_type: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '会社員' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_employee = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        'フリーランス' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_freelance = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '経営者' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_business_owner = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '主婦' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_housewife = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '学生' AS job_type,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND job_student = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const totalJob = jobRows.reduce((sum, row) => sum + Number(row.count), 0);
  const job = jobRows.map((row) => ({
    label: row.job_type,
    count: Number(row.count),
    percent: totalJob > 0 ? (Number(row.count) / totalJob) * 100 : 0,
  }));

  // 現在の売上（アンケート完了者のみ、期間指定）
  const revenueRows = await runQuery<{ revenue_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '0円' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m0yen = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '1-10万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m1to10man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '10-50万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m10to50man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '50-100万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m50to100man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '100-500万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m100to500man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '500-1000万' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m500to1000man = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '1000万over' AS revenue_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND revenue_m1000manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.count), 0);
  const currentRevenue = revenueRows.map((row) => ({
    label: row.revenue_range,
    count: Number(row.count),
    percent: totalRevenue > 0 ? (Number(row.count) / totalRevenue) * 100 : 0,
  }));

  // 目標売上（アンケート完了者のみ、期間指定）
  const goalRows = await runQuery<{ goal_range: string; count: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        '10万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m10manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '50万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m50manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '100万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m100manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '300万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m300manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '500万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m500manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
      UNION ALL
      SELECT
        '1000万over' AS goal_range,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND goal_m1000manover = 1 THEN id END) AS count
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const totalGoal = goalRows.reduce((sum, row) => sum + Number(row.count), 0);
  const goalRevenue = goalRows.map((row) => ({
    label: row.goal_range,
    count: Number(row.count),
    percent: totalGoal > 0 ? (Number(row.count) / totalGoal) * 100 : 0,
  }));

  return {
    gender,
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
