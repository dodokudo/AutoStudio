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
  honmei: number;
  honmeiRate: number;
  weak: number;
  weakRate: number;
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
  quality: SourceQualityRow[];
}

export interface SourceQualityRow {
  label: string;
  registrations: number;
  surveyCompleted: number;
  honmei: number;
  honmeiRate: number;
  weak: number;
  weakRate: number;
}

export interface AudienceSegment {
  label: string;
  count: number;
  percent: number;
  description: string;
  tone: 'green' | 'amber' | 'red' | 'slate';
}

// 属性分析のデータ型
export interface AttributeAnalysis {
  audienceSegments: AudienceSegment[];
  sourceSegments: SourceQualityRow[];
  gender: Array<{ label: string; count: number; percent: number }>;
  age: Array<{ label: string; count: number; percent: number }>;
  job: Array<{ label: string; count: number; percent: number }>;
  currentRevenue: Array<{ label: string; count: number; percent: number }>;
  goalRevenue: Array<{ label: string; count: number; percent: number }>;
}

function emptyAttributeAnalysis(): AttributeAnalysis {
  return {
    audienceSegments: [],
    sourceSegments: [],
    gender: [
      { label: '男性', count: 0, percent: 0 },
      { label: '女性', count: 0, percent: 0 },
    ],
    age: ['20代', '30代', '40代', '50代', '60代'].map((label) => ({ label, count: 0, percent: 0 })),
    job: ['会社員', 'フリーランス', '経営者', '主婦', '学生'].map((label) => ({ label, count: 0, percent: 0 })),
    currentRevenue: ['0円', '1-10万', '10-50万', '50-100万', '100-500万', '500-1000万', '1000万over'].map(
      (label) => ({ label, count: 0, percent: 0 }),
    ),
    goalRevenue: ['10万over', '50万over', '100万over', '300万over', '500万over', '1000万over'].map((label) => ({
      label,
      count: 0,
      percent: 0,
    })),
  };
}

const ATTRIBUTE_COLUMNS = [
  'gender_male',
  'gender_female',
  'survey_completed',
  '20s',
  '30s',
  '40s',
  '50s',
  '60s',
  'job_employee',
  'job_freelance',
  'job_business_owner',
  'job_housewife',
  'job_student',
  'revenue_m0yen',
  'revenue_m1to10man',
  'revenue_m10to50man',
  'revenue_m50to100man',
  'revenue_m100to500man',
  'revenue_m500to1000man',
  'revenue_m1000manover',
  'goal_m10manover',
  'goal_m50manover',
  'goal_m100manover',
  'goal_m300manover',
  'goal_m500manover',
  'goal_m1000manover',
];

export interface LstepAnalyticsData {
  funnel: FunnelAnalysis;
  dailyRegistrations: DailyRegistration[];
    sources: SourceAnalysis;
    attributes: AttributeAnalysis;
    latestSnapshotDate: string | null;
}

function emptySourceAnalysis(): SourceAnalysis {
  return {
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
    quality: [],
  };
}

/**
 * 期間内のLINE登録者数を取得（シンプル版）
 * ホームダッシュボードのKPIカード用
 */
export async function countLineRegistrationsByDateRange(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const datasetId = DEFAULT_DATASET;
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  // 最新のスナップショット日付を取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const snapshotDate = latestSnapshot?.snapshot_date;
  if (!snapshotDate) {
    return 0;
  }

  const [row] = await runQuery<{ total: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(DISTINCT id) AS total
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    `,
    params: { snapshotDate, startDate, endDate },
  });

  return Number(row?.total ?? 0);
}

/**
 * 期間内の「流入経路：広告」フラグが立っているLINE登録者数を取得
 * adsタブの広告経由LINE登録数KPI用。Lstep CSV の「流入経路：広告」列を `source` カラムに正規化したものを参照。
 * `source` カラムがまだ取り込まれていない場合は 0 を返す（CSV未取り込みフォールバック）。
 */
export async function countAdLineRegistrationsByDateRange(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const datasetId = DEFAULT_DATASET;
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const [columnRow] = await runQuery<{ column_count: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(*) AS column_count
      FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '${TABLE_NAME}' AND column_name = 'source'
    `,
  });
  if (!Number(columnRow?.column_count ?? 0)) {
    return 0;
  }

  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const snapshotDate = latestSnapshot?.snapshot_date;
  if (!snapshotDate) {
    return 0;
  }

  const [row] = await runQuery<{ total: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(DISTINCT id) AS total
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND source = 1
        AND friend_added_at IS NOT NULL
        AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    `,
    params: { snapshotDate, startDate, endDate },
  });

  return Number(row?.total ?? 0);
}


/**
 * 期間内の「流入経路：広告」LINE登録者数を日別に取得（JST基準）。
 * adsタブ日別パフォーマンステーブル用。
 */
export async function countAdLineRegistrationsDailyByDateRange(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const datasetId = DEFAULT_DATASET;
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const [columnRow] = await runQuery<{ column_count: number }>(client, projectId, datasetId, {
    query: `
      SELECT COUNT(*) AS column_count
      FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = '${TABLE_NAME}' AND column_name = 'source'
    `,
  });
  if (!Number(columnRow?.column_count ?? 0)) {
    return new Map();
  }

  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const snapshotDate = latestSnapshot?.snapshot_date;
  if (!snapshotDate) {
    return new Map();
  }

  const rows = await runQuery<{ date: string; total: number }>(client, projectId, datasetId, {
    query: `
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo")) AS date,
        COUNT(DISTINCT id) AS total
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND source = 1
        AND friend_added_at IS NOT NULL
        AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
      GROUP BY date
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.date, Number(row.total ?? 0));
  }
  return map;
}

export interface SourceCountResult {
  threads: number;
  instagram: number;
  youtube: number;
  organic: number;
  other: number;
  total: number;
}

/**
 * 期間内の流入経路別LINE登録者数を取得
 * lstep_friends_rawテーブルを使用（登録数KPIと同じデータソース）
 */
export async function countLineRegistrationsBySource(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<SourceCountResult> {
  const datasetId = DEFAULT_DATASET;
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  // 最新のスナップショット日付を取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
  });

  const snapshotDate = latestSnapshot?.snapshot_date;
  if (!snapshotDate) {
    return { threads: 0, instagram: 0, youtube: 0, organic: 0, other: 0, total: 0 };
  }

  // 各流入経路のカウントを取得
  // 複数の流入経路を持つユーザーは、最も優先度の高い流入経路にカウント
  // 優先順位: Threads > Instagram > YouTube > Organic > Other
  const [row] = await runQuery<{
    total: number;
    threads: number;
    instagram: number;
    youtube: number;
    organic: number;
  }>(client, projectId, datasetId, {
    query: `
      WITH users_in_range AS (
        SELECT
          id,
          -- Threads系（source_threads, source_threads_post, source_threads_profile, source_threads_fixed）
          GREATEST(
            COALESCE(source_threads, 0),
            COALESCE(source_threads_post, 0),
            COALESCE(source_threads_profile, 0),
            COALESCE(source_threads_fixed, 0)
          ) AS is_threads,
          -- Instagram系（source_instagram, source_instagram_profile, source_instagram_comment）
          GREATEST(
            COALESCE(source_instagram, 0),
            COALESCE(source_instagram_profile, 0),
            COALESCE(source_instagram_comment, 0)
          ) AS is_instagram,
          -- YouTube
          COALESCE(source_youtube, 0) AS is_youtube,
          -- Organic
          COALESCE(inflow_organic, 0) AS is_organic
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE snapshot_date = @snapshotDate
          AND friend_added_at IS NOT NULL
          AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
      ),
      categorized AS (
        SELECT
          id,
          CASE
            WHEN is_threads = 1 THEN 'threads'
            WHEN is_instagram = 1 THEN 'instagram'
            WHEN is_youtube = 1 THEN 'youtube'
            WHEN is_organic = 1 THEN 'organic'
            ELSE 'other'
          END AS source_category
        FROM users_in_range
      )
      SELECT
        COUNT(DISTINCT id) AS total,
        COUNTIF(source_category = 'threads') AS threads,
        COUNTIF(source_category = 'instagram') AS instagram,
        COUNTIF(source_category = 'youtube') AS youtube,
        COUNTIF(source_category = 'organic') AS organic
      FROM categorized
    `,
    params: { snapshotDate, startDate, endDate },
  });

  const total = Number(row?.total ?? 0);
  const threads = Number(row?.threads ?? 0);
  const instagram = Number(row?.instagram ?? 0);
  const youtube = Number(row?.youtube ?? 0);
  const organic = Number(row?.organic ?? 0);
  const other = total - threads - instagram - youtube - organic;

  return { threads, instagram, youtube, organic, other: Math.max(0, other), total };
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
      sources: emptySourceAnalysis(),
      attributes: emptyAttributeAnalysis(),
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
      sources: emptySourceAnalysis(),
      attributes: emptyAttributeAnalysis(),
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
 * user_coreとuser_surveysテーブルを使用
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
      WITH base_users AS (
        SELECT DISTINCT user_id
        FROM \`${projectId}.${datasetId}.user_core\`
        WHERE snapshot_date = @snapshotDate
      ),
      survey_entered_users AS (
        SELECT DISTINCT surveys.user_id
        FROM \`${projectId}.${datasetId}.user_surveys\` surveys
        WHERE surveys.snapshot_date = @snapshotDate
          AND surveys.question = 'フォーム流入'
          AND surveys.answer_flag = 1
      ),
      survey_completed_users AS (
        SELECT DISTINCT surveys.user_id
        FROM \`${projectId}.${datasetId}.user_surveys\` surveys
        WHERE surveys.snapshot_date = @snapshotDate
          AND surveys.question = '回答完了'
          AND surveys.answer_flag = 1
      )
      SELECT
        (SELECT COUNT(*) FROM base_users) AS total_users,
        (SELECT COUNT(*) FROM survey_entered_users) AS survey_entered,
        (SELECT COUNT(*) FROM survey_completed_users) AS survey_completed
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
    surveyCompletedCVR: totalUsers > 0 ? (surveyCompleted / totalUsers) * 100 : 0,
  };
}

/**
 * ファネル分析データを取得（期間指定）
 * user_coreとuser_surveysテーブルを使用
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
    ? 'AND DATE(TIMESTAMP(core.friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate'
    : '';

  const [row] = await runQuery<{
    total_users: number;
    survey_entered: number;
    survey_completed: number;
  }>(client, projectId, datasetId, {
    query: `
      WITH base_users AS (
        SELECT DISTINCT core.user_id
        FROM \`${projectId}.${datasetId}.user_core\` core
        WHERE core.snapshot_date = @snapshotDate
          AND core.friend_added_at IS NOT NULL
          ${dateFilter}
      ),
      survey_entered_users AS (
        SELECT DISTINCT core.user_id
        FROM \`${projectId}.${datasetId}.user_core\` core
        INNER JOIN \`${projectId}.${datasetId}.user_surveys\` surveys
          ON core.user_id = surveys.user_id
          AND core.snapshot_date = surveys.snapshot_date
        WHERE core.snapshot_date = @snapshotDate
          AND core.friend_added_at IS NOT NULL
          AND surveys.question = 'フォーム流入'
          AND surveys.answer_flag = 1
          ${dateFilter}
      ),
      survey_completed_users AS (
        SELECT DISTINCT core.user_id
        FROM \`${projectId}.${datasetId}.user_core\` core
        INNER JOIN \`${projectId}.${datasetId}.user_surveys\` surveys
          ON core.user_id = surveys.user_id
          AND core.snapshot_date = surveys.snapshot_date
        WHERE core.snapshot_date = @snapshotDate
          AND core.friend_added_at IS NOT NULL
          AND surveys.question = '回答完了'
          AND surveys.answer_flag = 1
          ${dateFilter}
      )
      SELECT
        (SELECT COUNT(*) FROM base_users) AS total_users,
        (SELECT COUNT(*) FROM survey_entered_users) AS survey_entered,
        (SELECT COUNT(*) FROM survey_completed_users) AS survey_completed
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
    surveyCompletedCVR: totalUsers > 0 ? (surveyCompleted / totalUsers) * 100 : 0,
  };
}

/**
 * 日別登録数を取得（連続した日付で表示）
 * user_coreテーブルを使用（L-STEP管理画面と同じデータソース）
 * アンケート回答完了はuser_surveysテーブルを使用
 */
async function getDailyRegistrations(
  client: BigQuery,
  projectId: string,
  datasetId: string,
): Promise<DailyRegistration[]> {
  // 最新のスナップショット日付を取得
  const [latestSnapshot] = await runQuery<{ snapshot_date: string }>(client, projectId, datasetId, {
    query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.user_core\``,
  });

  const latestSnapshotDate = latestSnapshot?.snapshot_date;
  if (!latestSnapshotDate) {
    return [];
  }

  // 日付範囲を生成し、登録数とアンケート完了数を取得
  // user_coreテーブルとuser_surveysテーブルを使用
  const rows = await runQuery<{
    registration_date: string;
    registrations: number;
    survey_completed: number;
    honmei: number;
    weak: number;
  }>(client, projectId, datasetId, {
    query: `
      WITH date_range AS (
        SELECT DATE_SUB(CURRENT_DATE("Asia/Tokyo"), INTERVAL n DAY) AS date
      FROM UNNEST(GENERATE_ARRAY(0, 89)) AS n
      ),
      daily_registrations AS (
        SELECT
          CAST(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") AS STRING) AS registration_date,
          COUNT(DISTINCT user_id) AS registrations
        FROM \`${projectId}.${datasetId}.user_core\`
        WHERE friend_added_at IS NOT NULL
          AND snapshot_date = @latestSnapshotDate
        GROUP BY registration_date
      ),
      daily_survey AS (
        SELECT
          CAST(DATE(TIMESTAMP(core.friend_added_at), "Asia/Tokyo") AS STRING) AS registration_date,
          COUNT(DISTINCT core.user_id) AS survey_completed
        FROM \`${projectId}.${datasetId}.user_core\` core
        INNER JOIN \`${projectId}.${datasetId}.user_surveys\` surveys
          ON core.user_id = surveys.user_id
          AND core.snapshot_date = surveys.snapshot_date
        WHERE core.friend_added_at IS NOT NULL
          AND core.snapshot_date = @latestSnapshotDate
          AND surveys.question = '回答完了'
          AND surveys.answer_flag = 1
        GROUP BY registration_date
      ),
      daily_quality AS (
        SELECT
          CAST(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") AS STRING) AS registration_date,
          COUNT(DISTINCT CASE
            WHEN survey_completed = 1
              AND (COALESCE(revenue_m10to50man, 0) + COALESCE(revenue_m50to100man, 0) + COALESCE(revenue_m100to500man, 0) + COALESCE(revenue_m500to1000man, 0) + COALESCE(revenue_m1000manover, 0)) > 0
              AND (COALESCE(goal_m100manover, 0) + COALESCE(goal_m300manover, 0) + COALESCE(goal_m500manover, 0) + COALESCE(goal_m1000manover, 0)) > 0
            THEN id END) AS honmei,
          COUNT(DISTINCT CASE
            WHEN survey_completed = 1
              AND (COALESCE(revenue_m0yen, 0) + COALESCE(revenue_m1to10man, 0)) > 0
              AND (COALESCE(goal_m10manover, 0) + COALESCE(goal_m50manover, 0)) > 0
            THEN id END) AS weak
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE friend_added_at IS NOT NULL
          AND snapshot_date = @latestSnapshotDate
        GROUP BY registration_date
      )
      SELECT
        CAST(dr.date AS STRING) AS registration_date,
        COALESCE(dreg.registrations, 0) AS registrations,
        COALESCE(ds.survey_completed, 0) AS survey_completed,
        COALESCE(dq.honmei, 0) AS honmei,
        COALESCE(dq.weak, 0) AS weak
      FROM date_range dr
      LEFT JOIN daily_registrations dreg ON CAST(dr.date AS STRING) = dreg.registration_date
      LEFT JOIN daily_survey ds ON CAST(dr.date AS STRING) = ds.registration_date
      LEFT JOIN daily_quality dq ON CAST(dr.date AS STRING) = dq.registration_date
      ORDER BY dr.date DESC
    `,
    params: { latestSnapshotDate },
  });

  return rows.map((row) => {
    const registrations = Number(row.registrations);
    const surveyCompleted = Number(row.survey_completed);
    const honmei = Number(row.honmei);
    const weak = Number(row.weak);
    const completionRate = registrations > 0 ? (surveyCompleted / registrations) * 100 : 0;

    return {
      date: row.registration_date,
      registrations,
      surveyCompleted,
      completionRate,
      honmei,
      honmeiRate: surveyCompleted > 0 ? (honmei / surveyCompleted) * 100 : 0,
      weak,
      weakRate: surveyCompleted > 0 ? (weak / surveyCompleted) * 100 : 0,
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
        AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN DATE_SUB(CURRENT_DATE("Asia/Tokyo"), INTERVAL 30 DAY) AND CURRENT_DATE("Asia/Tokyo")
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
    quality: await getSourceQualityRows(client, projectId, datasetId, snapshotDate),
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
        AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN DATE_SUB(CURRENT_DATE("Asia/Tokyo"), INTERVAL 30 DAY) AND CURRENT_DATE("Asia/Tokyo")
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
    quality: await getSourceQualityRows(client, projectId, datasetId, snapshotDate, startDate, endDate),
  };
}

function mapSourceQualityRows(rows: SourceQualityRow[]): SourceQualityRow[] {
  const order = ['代理店（山崎）', 'Threads', 'Instagram', 'YouTube', 'オーガニック', 'その他'];
  const rowMap = new Map(rows.map((row) => [row.label, row]));

  return order.map((label) => rowMap.get(label) ?? {
    label,
    registrations: 0,
    surveyCompleted: 0,
    honmei: 0,
    honmeiRate: 0,
    weak: 0,
    weakRate: 0,
  });
}

async function getSourceQualityRows(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
  startDate?: string,
  endDate?: string,
): Promise<SourceQualityRow[]> {
  const dateFilter = startDate && endDate
    ? 'AND DATE(TIMESTAMP(r.friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate'
    : '';

  const params = startDate && endDate
    ? { snapshotDate, startDate, endDate }
    : { snapshotDate };

  const rows = await runQuery<{
    label: string;
    registrations: number;
    surveyCompleted: number;
    honmei: number;
    honmeiRate: number;
    weak: number;
    weakRate: number;
  }>(client, projectId, datasetId, {
    query: `
      WITH latest_info AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM \`${projectId}.${datasetId}.user_info\`
      ),
      latest_tags AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM \`${projectId}.${datasetId}.user_tags\`
      ),
      yamazaki_info AS (
        SELECT DISTINCT ui.user_id
        FROM \`${projectId}.${datasetId}.user_info\` ui
        CROSS JOIN latest_info li
        WHERE ui.snapshot_date = li.snapshot_date
          AND field_name = '流入元'
          AND field_value = '山崎'
      ),
      yamazaki_tag AS (
        SELECT DISTINCT ut.user_id
        FROM \`${projectId}.${datasetId}.user_tags\` ut
        CROSS JOIN latest_tags lt
        WHERE ut.snapshot_date = lt.snapshot_date
          AND tag_flag = 1
          AND tag_name = '山崎'
      ),
      base AS (
        SELECT
          CASE
            WHEN yi.user_id IS NOT NULL AND yt.user_id IS NULL THEN '山崎SNSパネル'
            WHEN yi.user_id IS NOT NULL AND yt.user_id IS NOT NULL THEN '山崎既存LINE'
            ELSE '自分側'
          END AS label,
          r.id,
          r.survey_completed,
          GREATEST(
            COALESCE(r.source_threads, 0),
            COALESCE(r.source_threads_post, 0),
            COALESCE(r.source_threads_profile, 0),
            COALESCE(r.source_threads_fixed, 0)
          ) AS is_threads,
          GREATEST(
            COALESCE(r.source_instagram, 0),
            COALESCE(r.source_instagram_profile, 0),
            COALESCE(r.source_instagram_comment, 0)
          ) AS is_instagram,
          COALESCE(r.source_youtube, 0) AS is_youtube,
          COALESCE(r.inflow_organic, 0) AS is_organic,
          IF(
            (COALESCE(r.revenue_m10to50man, 0) + COALESCE(r.revenue_m50to100man, 0) + COALESCE(r.revenue_m100to500man, 0) + COALESCE(r.revenue_m500to1000man, 0) + COALESCE(r.revenue_m1000manover, 0)) > 0
            AND (COALESCE(r.goal_m100manover, 0) + COALESCE(r.goal_m300manover, 0) + COALESCE(r.goal_m500manover, 0) + COALESCE(r.goal_m1000manover, 0)) > 0,
            1,
            0
          ) AS is_honmei,
          IF(
            (COALESCE(r.revenue_m0yen, 0) + COALESCE(r.revenue_m1to10man, 0)) > 0
            AND (COALESCE(r.goal_m10manover, 0) + COALESCE(r.goal_m50manover, 0)) > 0,
            1,
            0
          ) AS is_weak
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\` r
        LEFT JOIN yamazaki_info yi ON CAST(r.id AS STRING) = yi.user_id
        LEFT JOIN yamazaki_tag yt ON CAST(r.id AS STRING) = yt.user_id
        WHERE r.snapshot_date = @snapshotDate
          AND r.friend_added_at IS NOT NULL
          ${dateFilter}
      ),
      categorized AS (
        SELECT
          CASE
            WHEN label IN ('山崎SNSパネル', '山崎既存LINE') THEN '代理店（山崎）'
            WHEN is_threads = 1 THEN 'Threads'
            WHEN is_instagram = 1 THEN 'Instagram'
            WHEN is_youtube = 1 THEN 'YouTube'
            WHEN is_organic = 1 THEN 'オーガニック'
            ELSE 'その他'
          END AS label,
          id,
          survey_completed,
          is_honmei,
          is_weak
        FROM base
      )
      SELECT
        label,
        COUNT(DISTINCT id) AS registrations,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END) AS surveyCompleted,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND is_honmei = 1 THEN id END) AS honmei,
        ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN survey_completed = 1 AND is_honmei = 1 THEN id END), COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END)) * 100, 1) AS honmeiRate,
        COUNT(DISTINCT CASE WHEN survey_completed = 1 AND is_weak = 1 THEN id END) AS weak,
        ROUND(SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN survey_completed = 1 AND is_weak = 1 THEN id END), COUNT(DISTINCT CASE WHEN survey_completed = 1 THEN id END)) * 100, 1) AS weakRate
      FROM categorized
      GROUP BY label
    `,
    params,
  });

  return mapSourceQualityRows(rows.map((row) => ({
    label: String(row.label),
    registrations: Number(row.registrations),
    surveyCompleted: Number(row.surveyCompleted),
    honmei: Number(row.honmei),
    honmeiRate: Number(row.honmeiRate ?? 0),
    weak: Number(row.weak),
    weakRate: Number(row.weakRate ?? 0),
  })));
}

async function getAudienceSegments(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
  startDate?: string,
  endDate?: string,
): Promise<AudienceSegment[]> {
  const dateFilter = startDate && endDate
    ? 'AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate'
    : '';

  const params = startDate && endDate
    ? { snapshotDate, startDate, endDate }
    : { snapshotDate };

  const rows = await runQuery<{ label: string; count: number }>(client, projectId, datasetId, {
    query: `
      WITH classified AS (
        SELECT
          CASE
            WHEN
              (COALESCE(revenue_m10to50man, 0) + COALESCE(revenue_m50to100man, 0) + COALESCE(revenue_m100to500man, 0) + COALESCE(revenue_m500to1000man, 0) + COALESCE(revenue_m1000manover, 0)) > 0
              AND (COALESCE(goal_m100manover, 0) + COALESCE(goal_m300manover, 0) + COALESCE(goal_m500manover, 0) + COALESCE(goal_m1000manover, 0)) > 0
            THEN '本命層'
            WHEN
              (COALESCE(revenue_m0yen, 0) + COALESCE(revenue_m1to10man, 0)) > 0
              AND (COALESCE(goal_m10manover, 0) + COALESCE(goal_m50manover, 0)) > 0
            THEN '弱い層'
            WHEN
              (COALESCE(revenue_m0yen, 0) + COALESCE(revenue_m1to10man, 0)) > 0
              AND (COALESCE(goal_m100manover, 0) + COALESCE(goal_m300manover, 0) + COALESCE(goal_m500manover, 0) + COALESCE(goal_m1000manover, 0)) > 0
            THEN '熱量型'
            WHEN
              (COALESCE(revenue_m10to50man, 0) + COALESCE(revenue_m50to100man, 0) + COALESCE(revenue_m100to500man, 0) + COALESCE(revenue_m500to1000man, 0) + COALESCE(revenue_m1000manover, 0)) > 0
              AND (COALESCE(goal_m10manover, 0) + COALESCE(goal_m50manover, 0)) > 0
            THEN '売上あり低目標'
            ELSE '不明/その他'
          END AS label
        FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
        WHERE snapshot_date = @snapshotDate
          AND friend_added_at IS NOT NULL
          AND survey_completed = 1
          ${dateFilter}
      )
      SELECT label, COUNT(*) AS count
      FROM classified
      GROUP BY label
    `,
    params,
  });

  const metadata: Record<string, Pick<AudienceSegment, 'description' | 'tone'>> = {
    '本命層': { description: '現状10万以上 + 目標100万以上', tone: 'green' },
    '弱い層': { description: '現状0-10万 + 目標10万/50万', tone: 'red' },
    '熱量型': { description: '現状0-10万 + 目標100万以上', tone: 'amber' },
    '売上あり低目標': { description: '現状10万以上 + 目標10万/50万', tone: 'amber' },
    '不明/その他': { description: '上記に分類されない回答', tone: 'slate' },
  };
  const order = Object.keys(metadata);
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const rowMap = new Map(rows.map((row) => [String(row.label), Number(row.count)]));

  return order.map((label) => {
    const count = rowMap.get(label) ?? 0;
    return {
      label,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
      description: metadata[label].description,
      tone: metadata[label].tone,
    };
  });
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
  const hasAttributeColumns = await tableHasColumns(client, projectId, datasetId, TABLE_NAME, ATTRIBUTE_COLUMNS);
  if (!hasAttributeColumns) {
    return emptyAttributeAnalysis();
  }

  const defaultGender = [
    { label: '男性', count: 0, percent: 0 },
    { label: '女性', count: 0, percent: 0 },
  ];
  // 年齢層（アンケート完了者のみ）
  const hasGenderColumns = await tableHasColumns(client, projectId, datasetId, TABLE_NAME, [
    'gender_male',
    'gender_female',
  ]);
  const genderRows = hasGenderColumns
    ? await runQuery<{ gender_male: number; gender_female: number; total: number }>(
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
      )
    : [{ gender_male: 0, gender_female: 0, total: 0 }];

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
    audienceSegments: await getAudienceSegments(client, projectId, datasetId, snapshotDate),
    sourceSegments: await getSourceQualityRows(client, projectId, datasetId, snapshotDate),
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
  const hasAttributeColumns = await tableHasColumns(client, projectId, datasetId, TABLE_NAME, ATTRIBUTE_COLUMNS);
  if (!hasAttributeColumns) {
    return emptyAttributeAnalysis();
  }

  const dateFilter = startDate && endDate
    ? 'AND DATE(friend_added_at) BETWEEN @startDate AND @endDate'
    : '';

  // 性別（期間指定）
  const hasGenderColumns = await tableHasColumns(client, projectId, datasetId, TABLE_NAME, [
    'gender_male',
    'gender_female',
  ]);
  const genderRows = hasGenderColumns
    ? await runQuery<{ gender_male: number; gender_female: number; total: number }>(
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
      )
    : [{ gender_male: 0, gender_female: 0, total: 0 }];

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
    audienceSegments: await getAudienceSegments(client, projectId, datasetId, snapshotDate, startDate, endDate),
    sourceSegments: await getSourceQualityRows(client, projectId, datasetId, snapshotDate, startDate, endDate),
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

async function tableHasColumns(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  tableName: string,
  columnNames: string[],
): Promise<boolean> {
  const rows = await runQuery<{ column_name: string }>(client, projectId, datasetId, {
    query: `
      SELECT column_name
      FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @tableName
        AND column_name IN UNNEST(@columnNames)
    `,
    params: { tableName, columnNames },
  });

  return new Set(rows.map((row) => row.column_name)).size === columnNames.length;
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
