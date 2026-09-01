import type { BigQuery } from '@google-cloud/bigquery';

import type {
  SeptemberLaunchAnalysisPerson,
  SeptemberLaunchAnalysisResponse,
} from '@/types/launch';

const MEASUREMENT_START = '2026-08-28T21:00';
const MEASUREMENT_END = '2026-09-07T23:59';

const EXISTING_TARGET_TAG = '【既存】配信対象';
const NEW_TARGET_TAG = '【新規】配信対象';
const ATTENDANCE_TAG = '【2026.9】セミナー参加総数';
const FRONTEND_TAG = '【2026.9】フロント購入者総数';

const APPLICATION_SLOT_FIELD = '【2026.9】セミナー申込日';
const APPLICATION_AT_FIELD = 'セミナー申込計測';
const ATTENDANCE_DATE_FIELD = '【2026.9】セミナー参加日';
const FRONTEND_DATE_FIELD = '【2026.9】フロント購入日';

interface AnalysisRow {
  snapshot_date: string;
  user_id: string;
  display_name: string | null;
  segment: string;
  application_at: string;
  application_slot: string;
  attendance_date: string | null;
  frontend_date: string | null;
  attended: number | string | null;
  frontend_purchased: number | string | null;
  age20: number | string | null;
  age30: number | string | null;
  age40: number | string | null;
  age50: number | string | null;
  age60: number | string | null;
  gender_male: number | string | null;
  gender_female: number | string | null;
  job_employee: number | string | null;
  job_freelance: number | string | null;
  job_business_owner: number | string | null;
  job_housewife: number | string | null;
  job_student: number | string | null;
  revenue_0: number | string | null;
  revenue_1_10: number | string | null;
  revenue_10_50: number | string | null;
  revenue_50_100: number | string | null;
  revenue_100_500: number | string | null;
  revenue_500_1000: number | string | null;
  revenue_1000_over: number | string | null;
  media_organic: number | string | null;
  media_ad: number | string | null;
  source_names: string[] | null;
  registered_applications: number | string | null;
  excluded_applications: number | string | null;
}

function isActive(value: number | string | null | undefined): boolean {
  return Number(value ?? 0) === 1;
}

function singleTagLabel(items: Array<{ active: boolean; label: string }>): string {
  const selected = items.filter((item) => item.active).map((item) => item.label);
  if (selected.length === 0) return '未回答';
  if (selected.length > 1) return '複数設定';
  return selected[0];
}

function normalizeSeptemberDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const fullDate = value.match(/2026[/-]0?9[/-]0?(\d{1,2})/);
  const shortDate = value.match(/(?:^|[^0-9])0?9[/-]0?(\d{1,2})(?:[^0-9]|$)/);
  const day = Number(fullDate?.[1] ?? shortDate?.[1]);
  if (!Number.isInteger(day) || day < 1 || day > 30) return null;
  return `2026-09-${String(day).padStart(2, '0')}`;
}

function normalizeSourceNames(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(Boolean).map((item) => String(item))));
}

function mapPerson(row: AnalysisRow): SeptemberLaunchAnalysisPerson {
  const age = singleTagLabel([
    { active: isActive(row.age20), label: '20代' },
    { active: isActive(row.age30), label: '30代' },
    { active: isActive(row.age40), label: '40代' },
    { active: isActive(row.age50), label: '50代' },
    { active: isActive(row.age60), label: '60代' },
  ]);
  const gender = singleTagLabel([
    { active: isActive(row.gender_male), label: '男性' },
    { active: isActive(row.gender_female), label: '女性' },
  ]);
  const job = singleTagLabel([
    { active: isActive(row.job_employee), label: '会社員' },
    { active: isActive(row.job_freelance), label: 'フリーランス' },
    { active: isActive(row.job_business_owner), label: '経営者' },
    { active: isActive(row.job_housewife), label: '主婦' },
    { active: isActive(row.job_student), label: '学生' },
  ]);
  const revenue = singleTagLabel([
    { active: isActive(row.revenue_0), label: '0円' },
    { active: isActive(row.revenue_1_10), label: '1〜10万円' },
    { active: isActive(row.revenue_10_50), label: '10〜50万円' },
    { active: isActive(row.revenue_50_100), label: '50〜100万円' },
    { active: isActive(row.revenue_100_500), label: '100〜500万円' },
    { active: isActive(row.revenue_500_1000), label: '500〜1000万円' },
    { active: isActive(row.revenue_1000_over), label: '1000万円以上' },
  ]);

  const sourceMedia: string[] = [];
  if (isActive(row.media_organic)) sourceMedia.push('OG');
  if (isActive(row.media_ad)) sourceMedia.push('広告');

  const applicationAt = String(row.application_at);

  return {
    userId: String(row.user_id),
    displayName: row.display_name?.trim() || '表示名なし',
    segment: row.segment === 'new' ? 'new' : 'existing',
    applicationAt,
    applicationDate: applicationAt.slice(0, 10),
    seminarDate: normalizeSeptemberDate(row.application_slot),
    seminarSlot: row.application_slot,
    age,
    gender,
    job,
    revenue,
    sourceMedia,
    sourceRoutes: normalizeSourceNames(row.source_names),
    attended: isActive(row.attended),
    attendanceDate: normalizeSeptemberDate(row.attendance_date),
    frontendPurchased: isActive(row.frontend_purchased),
    frontendDate: normalizeSeptemberDate(row.frontend_date),
  };
}

export async function fetchSeptemberLaunchAnalysis(
  bigquery: BigQuery,
  projectId: string,
  dataset: string,
): Promise<SeptemberLaunchAnalysisResponse> {
  const [rows] = await bigquery.query({
    query: `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM \`${projectId}.${dataset}.user_core\`
      ),
      core AS (
        SELECT
          user_id,
          display_name,
          SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', friend_added_at) AS friend_added_at
        FROM \`${projectId}.${dataset}.user_core\`
        JOIN latest USING (snapshot_date)
      ),
      tag_flags AS (
        SELECT
          user_id,
          MAX(IF(tag_name = @existingTargetTag AND tag_flag = 1, 1, 0)) AS existing_target,
          MAX(IF(tag_name = @newTargetTag AND tag_flag = 1, 1, 0)) AS new_target,
          MAX(IF(tag_name = @attendanceTag AND tag_flag = 1, 1, 0)) AS attended,
          MAX(IF(tag_name = @frontendTag AND tag_flag = 1, 1, 0)) AS frontend_purchased,
          MAX(IF(tag_name = '20代' AND tag_flag = 1, 1, 0)) AS age20,
          MAX(IF(tag_name = '30代' AND tag_flag = 1, 1, 0)) AS age30,
          MAX(IF(tag_name = '40代' AND tag_flag = 1, 1, 0)) AS age40,
          MAX(IF(tag_name = '50代' AND tag_flag = 1, 1, 0)) AS age50,
          MAX(IF(tag_name = '60代' AND tag_flag = 1, 1, 0)) AS age60,
          MAX(IF(tag_name = '男' AND tag_flag = 1, 1, 0)) AS gender_male,
          MAX(IF(tag_name = '女' AND tag_flag = 1, 1, 0)) AS gender_female,
          MAX(IF(tag_name = '職業：会社員' AND tag_flag = 1, 1, 0)) AS job_employee,
          MAX(IF(tag_name = '職業：フリーランス' AND tag_flag = 1, 1, 0)) AS job_freelance,
          MAX(IF(tag_name = '職業：経営者' AND tag_flag = 1, 1, 0)) AS job_business_owner,
          MAX(IF(tag_name = '職業：主婦' AND tag_flag = 1, 1, 0)) AS job_housewife,
          MAX(IF(tag_name = '職業：学生' AND tag_flag = 1, 1, 0)) AS job_student,
          MAX(IF(tag_name = '売上：月0円' AND tag_flag = 1, 1, 0)) AS revenue_0,
          MAX(IF(tag_name = '売上：月1から10万円' AND tag_flag = 1, 1, 0)) AS revenue_1_10,
          MAX(IF(tag_name = '売上：月10から50万円' AND tag_flag = 1, 1, 0)) AS revenue_10_50,
          MAX(IF(tag_name = '売上：月50から100万円' AND tag_flag = 1, 1, 0)) AS revenue_50_100,
          MAX(IF(tag_name = '売上：月100から500万円' AND tag_flag = 1, 1, 0)) AS revenue_100_500,
          MAX(IF(tag_name = '売上：月500から1000万円' AND tag_flag = 1, 1, 0)) AS revenue_500_1000,
          MAX(IF(tag_name = '売上：月1000万円以上' AND tag_flag = 1, 1, 0)) AS revenue_1000_over,
          MAX(IF(tag_name = '流入媒体：OG' AND tag_flag = 1, 1, 0)) AS media_organic,
          MAX(IF(tag_name = '流入媒体：AD' AND tag_flag = 1, 1, 0)) AS media_ad
        FROM \`${projectId}.${dataset}.user_tags\`
        JOIN latest USING (snapshot_date)
        GROUP BY user_id
      ),
      source_flags AS (
        SELECT
          user_id,
          ARRAY_AGG(IF(source_flag = 1, source_name, NULL) IGNORE NULLS ORDER BY source_name) AS source_names
        FROM \`${projectId}.${dataset}.user_sources\`
        JOIN latest USING (snapshot_date)
        GROUP BY user_id
      ),
      info_raw AS (
        SELECT
          user_id,
          MAX(IF(field_name = @applicationSlotField, NULLIF(TRIM(field_value), ''), NULL)) AS application_slot,
          MAX(IF(field_name = @applicationAtField, NULLIF(TRIM(field_value), ''), NULL)) AS application_at_raw,
          MAX(IF(field_name = @attendanceDateField, NULLIF(TRIM(field_value), ''), NULL)) AS attendance_date,
          MAX(IF(field_name = @frontendDateField, NULLIF(TRIM(field_value), ''), NULL)) AS frontend_date
        FROM \`${projectId}.${dataset}.user_info\`
        JOIN latest USING (snapshot_date)
        GROUP BY user_id
      ),
      info AS (
        SELECT
          *,
          SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M', application_at_raw) AS application_at
        FROM info_raw
      ),
      registration_meta AS (
        SELECT
          COUNTIF(application_slot IS NOT NULL) AS registered_applications,
          COUNTIF(
            application_slot IS NOT NULL
            AND (
              application_at IS NULL
              OR application_at < PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
              OR application_at > PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd)
            )
          ) AS excluded_applications
        FROM info
      ),
      joined AS (
        SELECT
          core.user_id,
          core.display_name,
          core.friend_added_at,
          IF(
            core.friend_added_at >= PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart),
            'new',
            'existing'
          ) AS segment,
          info.application_at,
          info.application_slot,
          info.attendance_date,
          info.frontend_date,
          COALESCE(tag_flags.attended, 0) AS attended,
          COALESCE(tag_flags.frontend_purchased, 0) AS frontend_purchased,
          COALESCE(tag_flags.age20, 0) AS age20,
          COALESCE(tag_flags.age30, 0) AS age30,
          COALESCE(tag_flags.age40, 0) AS age40,
          COALESCE(tag_flags.age50, 0) AS age50,
          COALESCE(tag_flags.age60, 0) AS age60,
          COALESCE(tag_flags.gender_male, 0) AS gender_male,
          COALESCE(tag_flags.gender_female, 0) AS gender_female,
          COALESCE(tag_flags.job_employee, 0) AS job_employee,
          COALESCE(tag_flags.job_freelance, 0) AS job_freelance,
          COALESCE(tag_flags.job_business_owner, 0) AS job_business_owner,
          COALESCE(tag_flags.job_housewife, 0) AS job_housewife,
          COALESCE(tag_flags.job_student, 0) AS job_student,
          COALESCE(tag_flags.revenue_0, 0) AS revenue_0,
          COALESCE(tag_flags.revenue_1_10, 0) AS revenue_1_10,
          COALESCE(tag_flags.revenue_10_50, 0) AS revenue_10_50,
          COALESCE(tag_flags.revenue_50_100, 0) AS revenue_50_100,
          COALESCE(tag_flags.revenue_100_500, 0) AS revenue_100_500,
          COALESCE(tag_flags.revenue_500_1000, 0) AS revenue_500_1000,
          COALESCE(tag_flags.revenue_1000_over, 0) AS revenue_1000_over,
          COALESCE(tag_flags.media_organic, 0) AS media_organic,
          COALESCE(tag_flags.media_ad, 0) AS media_ad,
          source_flags.source_names
        FROM core
        JOIN info USING (user_id)
        LEFT JOIN tag_flags USING (user_id)
        LEFT JOIN source_flags USING (user_id)
      )
      SELECT
        CAST(latest.snapshot_date AS STRING) AS snapshot_date,
        joined.user_id,
        joined.display_name,
        joined.segment,
        FORMAT_DATETIME('%Y-%m-%d %H:%M', joined.application_at) AS application_at,
        joined.application_slot,
        joined.attendance_date,
        joined.frontend_date,
        joined.attended,
        joined.frontend_purchased,
        joined.age20,
        joined.age30,
        joined.age40,
        joined.age50,
        joined.age60,
        joined.gender_male,
        joined.gender_female,
        joined.job_employee,
        joined.job_freelance,
        joined.job_business_owner,
        joined.job_housewife,
        joined.job_student,
        joined.revenue_0,
        joined.revenue_1_10,
        joined.revenue_10_50,
        joined.revenue_50_100,
        joined.revenue_100_500,
        joined.revenue_500_1000,
        joined.revenue_1000_over,
        joined.media_organic,
        joined.media_ad,
        joined.source_names,
        registration_meta.registered_applications,
        registration_meta.excluded_applications
      FROM joined
      CROSS JOIN latest
      CROSS JOIN registration_meta
      WHERE joined.application_slot IS NOT NULL
        AND joined.application_at BETWEEN PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
          AND PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd)
      ORDER BY joined.application_at DESC, joined.user_id
    `,
    useLegacySql: false,
    params: {
      measurementStart: MEASUREMENT_START,
      measurementEnd: MEASUREMENT_END,
      existingTargetTag: EXISTING_TARGET_TAG,
      newTargetTag: NEW_TARGET_TAG,
      attendanceTag: ATTENDANCE_TAG,
      frontendTag: FRONTEND_TAG,
      applicationSlotField: APPLICATION_SLOT_FIELD,
      applicationAtField: APPLICATION_AT_FIELD,
      attendanceDateField: ATTENDANCE_DATE_FIELD,
      frontendDateField: FRONTEND_DATE_FIELD,
    },
  });

  const typedRows = rows as AnalysisRow[];
  const people = typedRows.map(mapPerson);
  const demographicUnknown = people.filter((person) =>
    [person.age, person.gender, person.job, person.revenue].some((value) => value === '未回答'),
  ).length;
  const demographicMultiTagged = people.filter((person) =>
    [person.age, person.gender, person.job, person.revenue].some((value) => value === '複数設定'),
  ).length;

  const firstRow = typedRows[0];
  const registeredApplications = Number(firstRow?.registered_applications ?? people.length);
  const excludedApplications = Number(firstRow?.excluded_applications ?? 0);

  return {
    snapshotDate: firstRow?.snapshot_date ?? '',
    measurementStartedAt: MEASUREMENT_START,
    measurementEndedAt: MEASUREMENT_END,
    people,
    dataQuality: {
      registeredApplications,
      includedApplications: people.length,
      excludedApplications,
      demographicUnknown,
      demographicMultiTagged,
    },
  };
}
