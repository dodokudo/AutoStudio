import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid date format');
  }

  if (startDate.getTime() > endDate.getTime()) {
    return { start: end, end: start };
  }

  return { start, end };
}

interface CrossAnalysisRow {
  dimension1: string;
  dimension2: string;
  count: number;
}

interface FourAxisRow {
  age: string;
  job: string;
  revenue: string;
  goal: string;
  count: number;
}

async function runQuery<T extends Record<string, unknown>>(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  query: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const [rows] = await client.query({
    query,
    params,
    useLegacySql: false,
    defaultDataset: { projectId, datasetId },
  });
  return rows as T[];
}

async function getCrossAnalysisData(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<{
  ageJob: CrossAnalysisRow[];
  ageRevenue: CrossAnalysisRow[];
  ageGoal: CrossAnalysisRow[];
  jobRevenue: CrossAnalysisRow[];
  jobGoal: CrossAnalysisRow[];
  revenueGoal: CrossAnalysisRow[];
  topCombinations: FourAxisRow[];
  threeAxisCombinations: { age: string; job: string; revenue: string; count: number }[];
  byAge: {
    age: string;
    total: number;
    jobBreakdown: { job: string; count: number; percent: number }[];
    revenueBreakdown: { revenue: string; count: number; percent: number }[];
    goalBreakdown: { goal: string; count: number; percent: number }[];
  }[];
  summary: {
    totalUsers: number;
    lowRevenue: number;
    goal100man: number;
    age30to50: number;
    employeeFreelance: number;
  };
}> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const datasetId = DEFAULT_DATASET;

  // 最新スナップショット取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string }>(
    client,
    projectId,
    datasetId,
    `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
    {},
  );
  const snapshotDate = latestSnapshot?.snapshot_date;
  if (!snapshotDate) {
    throw new Error('No snapshot data available');
  }

  const baseWhere = `
    snapshot_date = @snapshotDate
    AND DATE(friend_added_at) >= @startDate
    AND DATE(friend_added_at) <= @endDate
    AND survey_completed = 1
  `;
  const params = { snapshotDate, startDate, endDate };

  // 年齢×職業
  const ageJobQuery = `
    SELECT
      CASE
        WHEN \`20s\` = 1 THEN '20代'
        WHEN \`30s\` = 1 THEN '30代'
        WHEN \`40s\` = 1 THEN '40代'
        WHEN \`50s\` = 1 THEN '50代'
        WHEN \`60s\` = 1 THEN '60代'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN job_employee = 1 THEN '会社員'
        WHEN job_freelance = 1 THEN 'フリーランス'
        WHEN job_business_owner = 1 THEN '経営者'
        WHEN job_housewife = 1 THEN '主婦'
        WHEN job_student = 1 THEN '学生'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // 年齢×現在売上
  const ageRevenueQuery = `
    SELECT
      CASE
        WHEN \`20s\` = 1 THEN '20代'
        WHEN \`30s\` = 1 THEN '30代'
        WHEN \`40s\` = 1 THEN '40代'
        WHEN \`50s\` = 1 THEN '50代'
        WHEN \`60s\` = 1 THEN '60代'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN revenue_m0yen = 1 THEN '0円'
        WHEN revenue_m1to10man = 1 THEN '1-10万'
        WHEN revenue_m10to50man = 1 THEN '10-50万'
        WHEN revenue_m50to100man = 1 THEN '50-100万'
        WHEN revenue_m100to500man = 1 THEN '100万+'
        WHEN revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // 年齢×目標売上
  const ageGoalQuery = `
    SELECT
      CASE
        WHEN \`20s\` = 1 THEN '20代'
        WHEN \`30s\` = 1 THEN '30代'
        WHEN \`40s\` = 1 THEN '40代'
        WHEN \`50s\` = 1 THEN '50代'
        WHEN \`60s\` = 1 THEN '60代'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN goal_m10manover = 1 THEN '10万'
        WHEN goal_m50manover = 1 THEN '50万'
        WHEN goal_m100manover = 1 THEN '100万'
        WHEN goal_m300manover = 1 THEN '300万+'
        WHEN goal_m500manover = 1 OR goal_m1000manover = 1 THEN '300万+'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // 職業×現在売上
  const jobRevenueQuery = `
    SELECT
      CASE
        WHEN job_employee = 1 THEN '会社員'
        WHEN job_freelance = 1 THEN 'フリーランス'
        WHEN job_business_owner = 1 THEN '経営者'
        WHEN job_housewife = 1 THEN '主婦'
        WHEN job_student = 1 THEN '学生'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN revenue_m0yen = 1 THEN '0円'
        WHEN revenue_m1to10man = 1 THEN '1-10万'
        WHEN revenue_m10to50man = 1 THEN '10-50万'
        WHEN revenue_m50to100man = 1 THEN '50-100万'
        WHEN revenue_m100to500man = 1 THEN '100万+'
        WHEN revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // 職業×目標売上
  const jobGoalQuery = `
    SELECT
      CASE
        WHEN job_employee = 1 THEN '会社員'
        WHEN job_freelance = 1 THEN 'フリーランス'
        WHEN job_business_owner = 1 THEN '経営者'
        WHEN job_housewife = 1 THEN '主婦'
        WHEN job_student = 1 THEN '学生'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN goal_m10manover = 1 THEN '10万'
        WHEN goal_m50manover = 1 THEN '50万'
        WHEN goal_m100manover = 1 THEN '100万'
        WHEN goal_m300manover = 1 THEN '300万+'
        WHEN goal_m500manover = 1 OR goal_m1000manover = 1 THEN '300万+'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // 現在売上×目標売上
  const revenueGoalQuery = `
    SELECT
      CASE
        WHEN revenue_m0yen = 1 THEN '0円'
        WHEN revenue_m1to10man = 1 THEN '1-10万'
        WHEN revenue_m10to50man = 1 THEN '10-50万'
        WHEN revenue_m50to100man = 1 THEN '50-100万'
        WHEN revenue_m100to500man = 1 THEN '100万+'
        WHEN revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
        ELSE '不明'
      END as dimension1,
      CASE
        WHEN goal_m10manover = 1 THEN '10万'
        WHEN goal_m50manover = 1 THEN '50万'
        WHEN goal_m100manover = 1 THEN '100万'
        WHEN goal_m300manover = 1 THEN '300万+'
        WHEN goal_m500manover = 1 OR goal_m1000manover = 1 THEN '300万+'
        ELSE '不明'
      END as dimension2,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY dimension1, dimension2
    HAVING dimension1 != '不明' AND dimension2 != '不明'
  `;

  // サマリー用クエリ
  const summaryQuery = `
    SELECT
      COUNT(DISTINCT id) as total_users,
      COUNT(DISTINCT CASE WHEN revenue_m0yen = 1 OR revenue_m1to10man = 1 THEN id END) as low_revenue,
      COUNT(DISTINCT CASE WHEN goal_m100manover = 1 THEN id END) as goal_100man,
      COUNT(DISTINCT CASE WHEN \`30s\` = 1 OR \`40s\` = 1 OR \`50s\` = 1 THEN id END) as age_30to50,
      COUNT(DISTINCT CASE WHEN job_employee = 1 OR job_freelance = 1 THEN id END) as employee_freelance
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
  `;

  // 4軸クロス分析（TOP15）
  const fourAxisQuery = `
    SELECT
      CASE
        WHEN \`20s\` = 1 THEN '20代'
        WHEN \`30s\` = 1 THEN '30代'
        WHEN \`40s\` = 1 THEN '40代'
        WHEN \`50s\` = 1 THEN '50代'
        WHEN \`60s\` = 1 THEN '60代'
      END as age,
      CASE
        WHEN job_employee = 1 THEN '会社員'
        WHEN job_freelance = 1 THEN 'フリーランス'
        WHEN job_business_owner = 1 THEN '経営者'
        WHEN job_housewife = 1 THEN '主婦'
        WHEN job_student = 1 THEN '学生'
      END as job,
      CASE
        WHEN revenue_m0yen = 1 THEN '0円'
        WHEN revenue_m1to10man = 1 THEN '1-10万'
        WHEN revenue_m10to50man = 1 THEN '10-50万'
        WHEN revenue_m50to100man = 1 THEN '50-100万'
        WHEN revenue_m100to500man = 1 OR revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
      END as revenue,
      CASE
        WHEN goal_m10manover = 1 THEN '10万'
        WHEN goal_m50manover = 1 THEN '50万'
        WHEN goal_m100manover = 1 THEN '100万'
        WHEN goal_m300manover = 1 OR goal_m500manover = 1 OR goal_m1000manover = 1 THEN '300万+'
      END as goal,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY age, job, revenue, goal
    HAVING age IS NOT NULL AND job IS NOT NULL AND revenue IS NOT NULL AND goal IS NOT NULL
    ORDER BY count DESC
    LIMIT 15
  `;

  // 3軸クロス分析（年齢×職業×現在売上）TOP15
  const threeAxisQuery = `
    SELECT
      CASE
        WHEN \`20s\` = 1 THEN '20代'
        WHEN \`30s\` = 1 THEN '30代'
        WHEN \`40s\` = 1 THEN '40代'
        WHEN \`50s\` = 1 THEN '50代'
        WHEN \`60s\` = 1 THEN '60代'
      END as age,
      CASE
        WHEN job_employee = 1 THEN '会社員'
        WHEN job_freelance = 1 THEN 'フリーランス'
        WHEN job_business_owner = 1 THEN '経営者'
        WHEN job_housewife = 1 THEN '主婦'
        WHEN job_student = 1 THEN '学生'
      END as job,
      CASE
        WHEN revenue_m0yen = 1 THEN '0円'
        WHEN revenue_m1to10man = 1 THEN '1-10万'
        WHEN revenue_m10to50man = 1 THEN '10-50万'
        WHEN revenue_m50to100man = 1 THEN '50-100万'
        WHEN revenue_m100to500man = 1 OR revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
      END as revenue,
      COUNT(DISTINCT id) as count
    FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    WHERE ${baseWhere}
    GROUP BY age, job, revenue
    HAVING age IS NOT NULL AND job IS NOT NULL AND revenue IS NOT NULL
    ORDER BY count DESC
    LIMIT 15
  `;

  // 年代別の詳細分析
  const byAgeQuery = `
    WITH base AS (
      SELECT
        id,
        CASE
          WHEN \`20s\` = 1 THEN '20代'
          WHEN \`30s\` = 1 THEN '30代'
          WHEN \`40s\` = 1 THEN '40代'
          WHEN \`50s\` = 1 THEN '50代'
          WHEN \`60s\` = 1 THEN '60代'
        END as age,
        CASE
          WHEN job_employee = 1 THEN '会社員'
          WHEN job_freelance = 1 THEN 'フリーランス'
          WHEN job_business_owner = 1 THEN '経営者'
          WHEN job_housewife = 1 THEN '主婦'
          WHEN job_student = 1 THEN '学生'
        END as job,
        CASE
          WHEN revenue_m0yen = 1 THEN '0円'
          WHEN revenue_m1to10man = 1 THEN '1-10万'
          WHEN revenue_m10to50man = 1 THEN '10-50万'
          WHEN revenue_m50to100man = 1 THEN '50-100万'
          WHEN revenue_m100to500man = 1 OR revenue_m500to1000man = 1 OR revenue_m1000manover = 1 THEN '100万+'
        END as revenue,
        CASE
          WHEN goal_m10manover = 1 THEN '10万'
          WHEN goal_m50manover = 1 THEN '50万'
          WHEN goal_m100manover = 1 THEN '100万'
          WHEN goal_m300manover = 1 OR goal_m500manover = 1 OR goal_m1000manover = 1 THEN '300万+'
        END as goal
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE ${baseWhere}
    )
    SELECT
      age,
      job,
      revenue,
      goal,
      COUNT(DISTINCT id) as count
    FROM base
    WHERE age IS NOT NULL AND job IS NOT NULL AND revenue IS NOT NULL AND goal IS NOT NULL
    GROUP BY age, job, revenue, goal
  `;

  const [ageJob, ageRevenue, ageGoal, jobRevenue, jobGoal, revenueGoal, summaryRows, fourAxisRows, threeAxisRows, byAgeRows] = await Promise.all([
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, ageJobQuery, params),
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, ageRevenueQuery, params),
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, ageGoalQuery, params),
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, jobRevenueQuery, params),
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, jobGoalQuery, params),
    runQuery<{ dimension1: string; dimension2: string; count: number }>(client, projectId, datasetId, revenueGoalQuery, params),
    runQuery<{ total_users: number; low_revenue: number; goal_100man: number; age_30to50: number; employee_freelance: number }>(client, projectId, datasetId, summaryQuery, params),
    runQuery<{ age: string; job: string; revenue: string; goal: string; count: number }>(client, projectId, datasetId, fourAxisQuery, params),
    runQuery<{ age: string; job: string; revenue: string; count: number }>(client, projectId, datasetId, threeAxisQuery, params),
    runQuery<{ age: string; job: string; revenue: string; goal: string; count: number }>(client, projectId, datasetId, byAgeQuery, params),
  ]);

  const summaryRow = summaryRows[0];

  return {
    ageJob: ageJob.map(r => ({ ...r, count: Number(r.count) })),
    ageRevenue: ageRevenue.map(r => ({ ...r, count: Number(r.count) })),
    ageGoal: ageGoal.map(r => ({ ...r, count: Number(r.count) })),
    jobRevenue: jobRevenue.map(r => ({ ...r, count: Number(r.count) })),
    jobGoal: jobGoal.map(r => ({ ...r, count: Number(r.count) })),
    revenueGoal: revenueGoal.map(r => ({ ...r, count: Number(r.count) })),
    topCombinations: fourAxisRows.map(r => ({
      age: r.age,
      job: r.job,
      revenue: r.revenue,
      goal: r.goal,
      count: Number(r.count),
    })),
    threeAxisCombinations: threeAxisRows.map(r => ({
      age: r.age,
      job: r.job,
      revenue: r.revenue,
      count: Number(r.count),
    })),
    byAge: (() => {
      const ageGroups = ['20代', '30代', '40代', '50代'];
      const jobOrder = ['会社員', 'フリーランス', '経営者', '主婦', '学生'];
      const revenueOrder = ['0円', '1-10万', '10-50万', '50-100万', '100万+'];
      const goalOrder = ['10万', '50万', '100万', '300万+'];

      return ageGroups.map(age => {
        const ageData = byAgeRows.filter(r => r.age === age);
        const total = ageData.reduce((sum, r) => sum + Number(r.count), 0);

        // 職業別集計
        const jobCounts: Record<string, number> = {};
        for (const r of ageData) {
          jobCounts[r.job] = (jobCounts[r.job] || 0) + Number(r.count);
        }
        const jobBreakdown = jobOrder.map(job => ({
          job,
          count: jobCounts[job] || 0,
          percent: total > 0 ? ((jobCounts[job] || 0) / total) * 100 : 0,
        })).filter(j => j.count > 0);

        // 売上別集計
        const revenueCounts: Record<string, number> = {};
        for (const r of ageData) {
          revenueCounts[r.revenue] = (revenueCounts[r.revenue] || 0) + Number(r.count);
        }
        const revenueBreakdown = revenueOrder.map(revenue => ({
          revenue,
          count: revenueCounts[revenue] || 0,
          percent: total > 0 ? ((revenueCounts[revenue] || 0) / total) * 100 : 0,
        })).filter(r => r.count > 0);

        // 目標別集計
        const goalCounts: Record<string, number> = {};
        for (const r of ageData) {
          goalCounts[r.goal] = (goalCounts[r.goal] || 0) + Number(r.count);
        }
        const goalBreakdown = goalOrder.map(goal => ({
          goal,
          count: goalCounts[goal] || 0,
          percent: total > 0 ? ((goalCounts[goal] || 0) / total) * 100 : 0,
        })).filter(g => g.count > 0);

        return { age, total, jobBreakdown, revenueBreakdown, goalBreakdown };
      });
    })(),
    summary: {
      totalUsers: Number(summaryRow?.total_users ?? 0),
      lowRevenue: Number(summaryRow?.low_revenue ?? 0),
      goal100man: Number(summaryRow?.goal_100man ?? 0),
      age30to50: Number(summaryRow?.age_30to50 ?? 0),
      employeeFreelance: Number(summaryRow?.employee_freelance ?? 0),
    },
  };
}

export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!isValidDate(startParam) || !isValidDate(endParam)) {
    return NextResponse.json({ error: 'start and end query parameters (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let start: string;
  let end: string;

  try {
    ({ start, end } = normalizeDateRange(startParam, endParam));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const data = await getCrossAnalysisData(PROJECT_ID, start, end);
    return NextResponse.json({ range: { start, end }, ...data }, { status: 200 });
  } catch (error) {
    console.error('[api/line/cross-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch cross analysis data' }, { status: 500 });
  }
}
