import type { BigQuery } from '@google-cloud/bigquery';

import type { SeptemberLaunchSnapshot } from '@/types/launch';

const MEASUREMENT_START = '2026-08-28T21:00';
const MEASUREMENT_END = '2026-09-07T23:59';

const EXISTING_TARGET_TAG = '【既存】配信対象';
const NEW_TARGET_TAG = '【新規】配信対象';
const SURVEY_RESPONSE_TAG = '【2026.8】アンケート回答済み';
const VIDEO_VIEW_TAG = '【2026.8】動画視聴総数';
// 今回の期間限定ローンチは8月に集客を開始したため、参加実績タグも8月名で運用されている。
const ATTENDANCE_TAG = '【2026.8】セミナー参加総数';
const FRONTEND_TAG = '【2026.9】フロント購入者総数';
const BACKEND_TAG = '【2026.9】バックエンド購入者総数';

const APPLICATION_SLOT_FIELD = '【2026.9】セミナー申込日';
const APPLICATION_AT_FIELD = 'セミナー申込計測';
const ATTENDANCE_DATE_FIELD = '【2026.9】セミナー参加日';
const FRONTEND_DATE_FIELD = '【2026.9】フロント購入日';

interface SnapshotRow {
  kind: string;
  date: string | null;
  segment: string | null;
  value: number | string;
}

export async function fetchSeptemberLaunchSnapshot(
  bigquery: BigQuery,
  projectId: string,
  dataset: string,
): Promise<SeptemberLaunchSnapshot | null> {
  const [rows] = await bigquery.query({
    query: `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM \`${projectId}.${dataset}.user_core\`
      ),
      core AS (
        SELECT
          user_id,
          SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', friend_added_at) AS friend_added_at,
          blocked
        FROM \`${projectId}.${dataset}.user_core\`
        JOIN latest USING (snapshot_date)
      ),
      tag_flags AS (
        SELECT
          user_id,
          MAX(IF(tag_name = @existingTargetTag AND tag_flag = 1, 1, 0)) AS existing_target,
          MAX(IF(tag_name = @newTargetTag AND tag_flag = 1, 1, 0)) AS new_target,
          MAX(IF(tag_name = @surveyResponseTag AND tag_flag = 1, 1, 0)) AS survey_response,
          MAX(IF(tag_name = @videoViewTag AND tag_flag = 1, 1, 0)) AS video_view,
          MAX(IF(tag_name = @attendanceTag AND tag_flag = 1, 1, 0)) AS attended,
          MAX(IF(tag_name = @frontendTag AND tag_flag = 1, 1, 0)) AS frontend_purchased
        FROM \`${projectId}.${dataset}.user_tags\`
        JOIN latest USING (snapshot_date)
        GROUP BY user_id
      ),
      tag_totals AS (
        SELECT
          COUNTIF(tag_name = @attendanceTag) AS attendance_tag_rows,
          COUNTIF(tag_name = @attendanceTag AND tag_flag = 1) AS attendees,
          COUNTIF(tag_name = @frontendTag) AS frontend_tag_rows,
          COUNTIF(tag_name = @frontendTag AND tag_flag = 1) AS frontend_purchases,
          COUNTIF(tag_name = @backendTag) AS backend_tag_rows,
          COUNTIF(tag_name = @backendTag AND tag_flag = 1) AS backend_purchases
        FROM \`${projectId}.${dataset}.user_tags\`
        JOIN latest USING (snapshot_date)
      ),
      user_info AS (
        SELECT
          user_id,
          MAX(IF(field_name = @applicationSlotField, field_value, NULL)) AS application_slot,
          MAX(IF(field_name = @applicationAtField, field_value, NULL)) AS application_at,
          MAX(IF(field_name = @attendanceDateField, field_value, NULL)) AS attendance_date,
          MAX(IF(field_name = @frontendDateField, field_value, NULL)) AS frontend_date
        FROM \`${projectId}.${dataset}.user_info\`
        JOIN latest USING (snapshot_date)
        GROUP BY user_id
      ),
      joined AS (
        SELECT
          core.user_id,
          core.friend_added_at,
          COALESCE(tag_flags.existing_target, 0) AS existing_target,
          COALESCE(tag_flags.new_target, 0) AS new_target,
          COALESCE(tag_flags.survey_response, 0) AS survey_response,
          COALESCE(tag_flags.video_view, 0) AS video_view,
          COALESCE(tag_flags.attended, 0) AS attended,
          COALESCE(tag_flags.frontend_purchased, 0) AS frontend_purchased,
          user_info.application_slot,
          SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M', user_info.application_at) AS application_at,
          user_info.attendance_date,
          user_info.frontend_date
        FROM core
        LEFT JOIN tag_flags USING (user_id)
        LEFT JOIN user_info USING (user_id)
      ),
      segmented AS (
        SELECT
          *,
          CASE
            WHEN friend_added_at >= PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart) THEN 'new'
            ELSE 'existing'
          END AS segment
        FROM joined
      ),
      cohort AS (
        SELECT *
        FROM segmented
        WHERE
          (segment = 'new' AND friend_added_at BETWEEN PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
            AND PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd))
          OR (
            segment = 'existing'
            AND (
              existing_target = 1
              OR application_slot IS NOT NULL
              OR attended = 1
              OR frontend_purchased = 1
            )
          )
      ),
      applications AS (
        SELECT
          DATE(application_at) AS application_date,
          CASE
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?2([^0-9]|$)') THEN '2026-09-02'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?4([^0-9]|$)') THEN '2026-09-04'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?5([^0-9]|$)') THEN '2026-09-05'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?6([^0-9]|$)') THEN '2026-09-06'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?7([^0-9]|$)') THEN '2026-09-07'
            ELSE NULL
          END AS event_date,
          segment
        FROM cohort
        WHERE application_slot IS NOT NULL
          AND application_at BETWEEN PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
            AND PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd)
      ),
      dated_events AS (
        SELECT 'event_attendee' AS kind,
          CASE
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?2([^0-9]|$)') THEN '2026-09-02'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?4([^0-9]|$)') THEN '2026-09-04'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?5([^0-9]|$)') THEN '2026-09-05'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?6([^0-9]|$)') THEN '2026-09-06'
            WHEN REGEXP_CONTAINS(application_slot, r'(^|[^0-9])0?9[/-]0?7([^0-9]|$)') THEN '2026-09-07'
          END AS event_date
        FROM joined
        WHERE attended = 1
          AND application_slot IS NOT NULL

        UNION ALL

        SELECT 'event_frontend' AS kind,
          CASE
            WHEN REGEXP_CONTAINS(frontend_date, r'(^|[^0-9])0?9[/-]0?2([^0-9]|$)') THEN '2026-09-02'
            WHEN REGEXP_CONTAINS(frontend_date, r'(^|[^0-9])0?9[/-]0?4([^0-9]|$)') THEN '2026-09-04'
            WHEN REGEXP_CONTAINS(frontend_date, r'(^|[^0-9])0?9[/-]0?5([^0-9]|$)') THEN '2026-09-05'
            WHEN REGEXP_CONTAINS(frontend_date, r'(^|[^0-9])0?9[/-]0?6([^0-9]|$)') THEN '2026-09-06'
            WHEN REGEXP_CONTAINS(frontend_date, r'(^|[^0-9])0?9[/-]0?7([^0-9]|$)') THEN '2026-09-07'
          END AS event_date
        FROM joined
        WHERE frontend_date IS NOT NULL
      )
      SELECT 'snapshot' AS kind, CAST(snapshot_date AS STRING) AS date, CAST(NULL AS STRING) AS segment, 0 AS value
      FROM latest

      UNION ALL

      SELECT 'new_registration', FORMAT_DATE('%Y-%m-%d', DATE(friend_added_at)), NULL, COUNT(*)
      FROM core
      WHERE friend_added_at BETWEEN PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
        AND PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd)
      GROUP BY 2

      UNION ALL

      SELECT 'daily_application', FORMAT_DATE('%Y-%m-%d', application_date), segment, COUNT(*)
      FROM applications
      GROUP BY 2, 3

      UNION ALL

      SELECT 'segment_survey', NULL, segment, COUNTIF(survey_response = 1)
      FROM cohort
      GROUP BY segment

      UNION ALL

      SELECT 'segment_video', NULL, segment, COUNTIF(video_view = 1)
      FROM cohort
      GROUP BY segment

      UNION ALL

      SELECT 'segment_application', NULL, segment,
        COUNTIF(application_slot IS NOT NULL
          AND application_at BETWEEN PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementStart)
            AND PARSE_DATETIME('%Y-%m-%dT%H:%M', @measurementEnd))
      FROM cohort
      GROUP BY segment

      UNION ALL

      SELECT 'segment_attendee', NULL, segment, COUNTIF(attended = 1)
      FROM cohort
      GROUP BY segment

      UNION ALL

      SELECT 'segment_frontend', NULL, segment, COUNTIF(frontend_purchased = 1)
      FROM cohort
      GROUP BY segment

      UNION ALL

      SELECT 'event_application', event_date, NULL, COUNT(*)
      FROM applications
      WHERE event_date IS NOT NULL
      GROUP BY event_date

      UNION ALL

      SELECT kind, event_date, NULL, COUNT(*)
      FROM dated_events
      WHERE event_date IS NOT NULL
      GROUP BY kind, event_date

      UNION ALL

      SELECT 'attendance_total', NULL, NULL, attendees
      FROM tag_totals
      WHERE attendance_tag_rows > 0

      UNION ALL

      SELECT 'frontend_total', NULL, NULL, frontend_purchases
      FROM tag_totals
      WHERE frontend_tag_rows > 0

      UNION ALL

      SELECT 'backend_total', NULL, NULL, backend_purchases
      FROM tag_totals
      WHERE backend_tag_rows > 0
    `,
    useLegacySql: false,
    params: {
      measurementStart: MEASUREMENT_START,
      measurementEnd: MEASUREMENT_END,
      existingTargetTag: EXISTING_TARGET_TAG,
      newTargetTag: NEW_TARGET_TAG,
      surveyResponseTag: SURVEY_RESPONSE_TAG,
      videoViewTag: VIDEO_VIEW_TAG,
      attendanceTag: ATTENDANCE_TAG,
      frontendTag: FRONTEND_TAG,
      backendTag: BACKEND_TAG,
      applicationSlotField: APPLICATION_SLOT_FIELD,
      applicationAtField: APPLICATION_AT_FIELD,
      attendanceDateField: ATTENDANCE_DATE_FIELD,
      frontendDateField: FRONTEND_DATE_FIELD,
    },
  });

  const result: SeptemberLaunchSnapshot = {
    snapshotDate: '',
    dailyNewRegistrations: {},
    dailyApplications: {},
    eventApplications: {},
    eventAttendees: {},
    eventFrontendPurchases: {},
    attendees: null,
    frontendPurchases: null,
    backendPurchases: null,
    segmentFunnels: {
      existing: { surveyResponses: 0, videoViews: 0, applications: 0, attendees: 0, frontendPurchases: 0 },
      new: { surveyResponses: 0, videoViews: 0, applications: 0, attendees: 0, frontendPurchases: 0 },
    },
  };

  for (const rawRow of rows as SnapshotRow[]) {
    const value = Number(rawRow.value ?? 0);
    switch (rawRow.kind) {
      case 'snapshot':
        result.snapshotDate = rawRow.date ?? '';
        break;
      case 'new_registration':
        if (rawRow.date) result.dailyNewRegistrations[rawRow.date] = value;
        break;
      case 'daily_application':
        if (rawRow.date && (rawRow.segment === 'existing' || rawRow.segment === 'new')) {
          const current = result.dailyApplications[rawRow.date] ?? { existing: 0, new: 0 };
          result.dailyApplications[rawRow.date] = { ...current, [rawRow.segment]: value };
        }
        break;
      case 'segment_survey':
        if (rawRow.segment === 'existing' || rawRow.segment === 'new') result.segmentFunnels[rawRow.segment].surveyResponses = value;
        break;
      case 'segment_video':
        if (rawRow.segment === 'existing' || rawRow.segment === 'new') result.segmentFunnels[rawRow.segment].videoViews = value;
        break;
      case 'segment_application':
        if (rawRow.segment === 'existing' || rawRow.segment === 'new') result.segmentFunnels[rawRow.segment].applications = value;
        break;
      case 'segment_attendee':
        if (rawRow.segment === 'existing' || rawRow.segment === 'new') result.segmentFunnels[rawRow.segment].attendees = value;
        break;
      case 'segment_frontend':
        if (rawRow.segment === 'existing' || rawRow.segment === 'new') result.segmentFunnels[rawRow.segment].frontendPurchases = value;
        break;
      case 'event_application':
        if (rawRow.date) result.eventApplications[rawRow.date] = value;
        break;
      case 'event_attendee':
        if (rawRow.date) result.eventAttendees[rawRow.date] = value;
        break;
      case 'event_frontend':
        if (rawRow.date) result.eventFrontendPurchases[rawRow.date] = value;
        break;
      case 'attendance_total':
        result.attendees = value;
        break;
      case 'frontend_total':
        result.frontendPurchases = value;
        break;
      case 'backend_total':
        result.backendPurchases = value;
        break;
    }
  }

  return result.snapshotDate ? result : null;
}
