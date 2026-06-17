import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';

const DATASET_ID = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

// 通常アンケートの回答完了タグ。現行取込では user_surveys.question = '回答完了' にも入る。
const SURVEY_RESPONSE_TAG_NAMES = ['アンケート：回答完了'];
const SEMINAR_APPLICATION_TAG_NAMES = ['【2026.5】セミナー申込総数'];
const PURCHASE_TAG_NAMES = ['Threads教材'];
const SURVEY_RESPONSE_TAG_IDS = ['8087272', 'タグ_8087272'];
const SURVEY_COMPLETED_QUESTION = '回答完了';
const AGENCY_START_DATE = '2026-06-14';

export interface AgencyDailyRow {
  date: string | null;
  agency: string;
  registrations: number;
  blockedWithin7Days: number;
  surveyResponses: number;
  seminarApplications: number;
  purchases: number;
}

export interface AgencySummary {
  agency: string;
  registrations: number;
  blockedWithin7Days: number;
  surveyResponses: number;
  seminarApplications: number;
  purchases: number;
}

export interface AgencyStats {
  updatedAt: string | null;
  summary: AgencySummary[];
  daily: AgencyDailyRow[];
}

interface RawRow {
  snapshot_date: { value: string } | string | null;
  reg_date: { value: string } | string | null;
  agency: string;
  registrations: number;
  blocked_within_7_days: number;
  survey_responses: number;
  seminar_applications: number;
  purchases: number;
}

function toDateString(value: RawRow['reg_date']): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.value;
}

export async function getAgencyStats(): Promise<AgencyStats> {
  const projectId = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID);
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const table = (name: string) => `\`${projectId}.${DATASET_ID}.${name}\``;

  const [rows] = await client.query({
    query: `
      WITH info_latest AS (
        SELECT MAX(snapshot_date) AS sd
        FROM ${table('user_info')}
        WHERE field_name = '流入元'
          AND NULLIF(TRIM(field_value), '') IS NOT NULL
      ),
      core_latest AS (
        SELECT sd FROM info_latest
      ),
      tags_latest AS (
        SELECT sd FROM info_latest
      ),
      surveys_latest AS (
        SELECT sd FROM info_latest
      ),
      agency_users AS (
        SELECT DISTINCT i.user_id, i.field_value AS agency
        FROM ${table('user_info')} i, info_latest
        WHERE i.snapshot_date = info_latest.sd
          AND i.field_name = '流入元'
      ),
      core AS (
        -- friend_added_at は "YYYY-MM-DD HH:MM:SS"（JST）の文字列。日付部分をそのまま使う
        SELECT
          c.user_id,
          SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(ANY_VALUE(c.friend_added_at), 1, 10)) AS reg_date
        FROM ${table('user_core')} c, core_latest
        WHERE c.snapshot_date = core_latest.sd
        GROUP BY c.user_id
      ),
      first_blocked AS (
        SELECT
          user_id,
          MIN(snapshot_date) AS first_blocked_date
        FROM ${table('user_core')}
        WHERE blocked = TRUE
        GROUP BY user_id
      ),
      survey_responses AS (
        SELECT DISTINCT user_id
        FROM (
          SELECT t.user_id
          FROM ${table('user_tags')} t, tags_latest
          WHERE t.snapshot_date = tags_latest.sd
            AND (t.tag_name IN UNNEST(@surveyResponseTagNames) OR t.tag_id IN UNNEST(@surveyResponseTagIds))
            AND t.tag_flag = 1

          UNION DISTINCT

          SELECT s.user_id
          FROM ${table('user_surveys')} s, surveys_latest
          WHERE s.snapshot_date = surveys_latest.sd
            AND s.question = @surveyCompletedQuestion
            AND s.answer_flag = 1
        )
      ),
      seminar_applications AS (
        SELECT DISTINCT t.user_id
        FROM ${table('user_tags')} t, tags_latest
        WHERE t.snapshot_date = tags_latest.sd
          AND t.tag_name IN UNNEST(@seminarApplicationTagNames)
          AND t.tag_flag = 1
      ),
      purchases AS (
        SELECT DISTINCT t.user_id
        FROM ${table('user_tags')} t, tags_latest
        WHERE t.snapshot_date = tags_latest.sd
          AND t.tag_name IN UNNEST(@purchaseTagNames)
          AND t.tag_flag = 1
      )
      SELECT
        (SELECT sd FROM info_latest) AS snapshot_date,
        a.agency,
        c.reg_date,
        COUNT(*) AS registrations,
        COUNTIF(
          fb.first_blocked_date IS NOT NULL
          AND fb.first_blocked_date BETWEEN c.reg_date AND DATE_ADD(c.reg_date, INTERVAL 7 DAY)
        ) AS blocked_within_7_days,
        COUNTIF(sr.user_id IS NOT NULL) AS survey_responses,
        COUNTIF(sa.user_id IS NOT NULL) AS seminar_applications,
        COUNTIF(p.user_id IS NOT NULL) AS purchases
      FROM agency_users a
      LEFT JOIN core c USING (user_id)
      LEFT JOIN first_blocked fb USING (user_id)
      LEFT JOIN survey_responses sr USING (user_id)
      LEFT JOIN seminar_applications sa USING (user_id)
      LEFT JOIN purchases p USING (user_id)
      WHERE c.reg_date >= DATE(@agencyStartDate)
      GROUP BY a.agency, c.reg_date
      ORDER BY c.reg_date DESC
    `,
    params: {
      surveyResponseTagNames: SURVEY_RESPONSE_TAG_NAMES,
      surveyResponseTagIds: SURVEY_RESPONSE_TAG_IDS,
      surveyCompletedQuestion: SURVEY_COMPLETED_QUESTION,
      seminarApplicationTagNames: SEMINAR_APPLICATION_TAG_NAMES,
      purchaseTagNames: PURCHASE_TAG_NAMES,
      agencyStartDate: AGENCY_START_DATE,
    },
  });

  const rawRows = rows as RawRow[];

  const daily: AgencyDailyRow[] = rawRows.map((row) => ({
    date: toDateString(row.reg_date),
    agency: row.agency,
    registrations: Number(row.registrations ?? 0),
    blockedWithin7Days: Number(row.blocked_within_7_days ?? 0),
    surveyResponses: Number(row.survey_responses ?? 0),
    seminarApplications: Number(row.seminar_applications ?? 0),
    purchases: Number(row.purchases ?? 0),
  }));

  const summaryMap = new Map<string, AgencySummary>();
  for (const row of daily) {
    const entry = summaryMap.get(row.agency) ?? {
      agency: row.agency,
      registrations: 0,
      blockedWithin7Days: 0,
      surveyResponses: 0,
      seminarApplications: 0,
      purchases: 0,
    };
    entry.registrations += row.registrations;
    entry.blockedWithin7Days += row.blockedWithin7Days;
    entry.surveyResponses += row.surveyResponses;
    entry.seminarApplications += row.seminarApplications;
    entry.purchases += row.purchases;
    summaryMap.set(row.agency, entry);
  }

  const summary = Array.from(summaryMap.values()).sort(
    (a, b) => b.registrations - a.registrations || b.surveyResponses - a.surveyResponses,
  );

  const updatedAt = rawRows.length > 0 ? toDateString(rawRows[0].snapshot_date) : null;

  return { updatedAt, summary, daily };
}
