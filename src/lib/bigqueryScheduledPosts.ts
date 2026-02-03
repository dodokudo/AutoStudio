import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const TABLE = 'scheduled_posts';
const PLAN_TABLE = 'thread_post_plans';

const client: BigQuery = createBigQueryClient(PROJECT_ID);

const SCHEDULE_TABLE_SCHEMA = [
  { name: 'schedule_id', type: 'STRING' },
  { name: 'plan_id', type: 'STRING' },
  { name: 'scheduled_time', type: 'TIMESTAMP' },
  { name: 'status', type: 'STRING' },
  { name: 'main_text', type: 'STRING' },
  { name: 'comment1', type: 'STRING' },
  { name: 'comment2', type: 'STRING' },
  { name: 'created_at', type: 'TIMESTAMP' },
  { name: 'updated_at', type: 'TIMESTAMP' },
];

async function query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>) {
  const [rows] = await client.query({ query: sql, params });
  return rows as T[];
}

export async function ensureScheduledPostsTable() {
  const dataset = client.dataset(DATASET);
  const table = dataset.table(TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    try {
      await dataset.createTable(TABLE, { schema: SCHEDULE_TABLE_SCHEMA });
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!message.includes('Already Exists')) {
        throw error;
      }
    }
  }
}

function toPlain(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return typeof inner === 'string' ? inner : String(inner ?? '');
  }
  return String(value);
}

export type ScheduledPostRow = {
  schedule_id: string;
  plan_id?: string | null;
  scheduled_time: string;
  scheduled_at_jst: string;
  scheduled_date: string;
  status: string;
  main_text: string;
  comment1: string;
  comment2: string;
  created_at: string;
  updated_at: string;
  template_id?: string | null;
  theme?: string | null;
  plan_status?: string | null;
};

export async function listScheduledPosts(params: { startDate?: string; endDate?: string }) {
  await ensureScheduledPostsTable();
  const conditions: string[] = [];
  const queryParams: Record<string, unknown> = {};

  if (params.startDate) {
    conditions.push('DATE(sp.scheduled_time, "Asia/Tokyo") >= DATE(@startDate)');
    queryParams.startDate = params.startDate;
  }

  if (params.endDate) {
    conditions.push('DATE(sp.scheduled_time, "Asia/Tokyo") <= DATE(@endDate)');
    queryParams.endDate = params.endDate;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      sp.schedule_id,
      sp.plan_id,
      sp.scheduled_time,
      sp.status,
      sp.main_text,
      sp.comment1,
      sp.comment2,
      sp.created_at,
      sp.updated_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S+09:00', sp.scheduled_time, 'Asia/Tokyo') AS scheduled_at_jst,
      FORMAT_DATE('%Y-%m-%d', DATE(sp.scheduled_time, 'Asia/Tokyo')) AS scheduled_date,
      tp.template_id,
      tp.theme,
      tp.status AS plan_status
    FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\` sp
    LEFT JOIN \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` tp
      ON sp.plan_id = tp.plan_id
    ${whereClause}
    ORDER BY sp.scheduled_time ASC
  `;

  const rows = await query(sql, queryParams);
  return rows.map((row) => ({
    schedule_id: toPlain(row.schedule_id),
    plan_id: toPlain(row.plan_id) || null,
    scheduled_time: toPlain(row.scheduled_time),
    scheduled_at_jst: toPlain(row.scheduled_at_jst),
    scheduled_date: toPlain(row.scheduled_date),
    status: toPlain(row.status) || 'scheduled',
    main_text: toPlain(row.main_text),
    comment1: toPlain(row.comment1),
    comment2: toPlain(row.comment2),
    created_at: toPlain(row.created_at),
    updated_at: toPlain(row.updated_at),
    template_id: toPlain(row.template_id) || null,
    theme: toPlain(row.theme) || null,
    plan_status: toPlain(row.plan_status) || null,
  })) as ScheduledPostRow[];
}

export async function getScheduledPostById(scheduleId: string) {
  await ensureScheduledPostsTable();
  const sql = `
    SELECT
      sp.schedule_id,
      sp.plan_id,
      sp.scheduled_time,
      sp.status,
      sp.main_text,
      sp.comment1,
      sp.comment2,
      sp.created_at,
      sp.updated_at,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S+09:00', sp.scheduled_time, 'Asia/Tokyo') AS scheduled_at_jst,
      FORMAT_DATE('%Y-%m-%d', DATE(sp.scheduled_time, 'Asia/Tokyo')) AS scheduled_date,
      tp.template_id,
      tp.theme,
      tp.status AS plan_status
    FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\` sp
    LEFT JOIN \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` tp
      ON sp.plan_id = tp.plan_id
    WHERE sp.schedule_id = @scheduleId
    LIMIT 1
  `;
  const rows = await query(sql, { scheduleId });
  const row = rows[0];
  if (!row) return undefined;
  return {
    schedule_id: toPlain(row.schedule_id),
    plan_id: toPlain(row.plan_id) || null,
    scheduled_time: toPlain(row.scheduled_time),
    scheduled_at_jst: toPlain(row.scheduled_at_jst),
    scheduled_date: toPlain(row.scheduled_date),
    status: toPlain(row.status) || 'scheduled',
    main_text: toPlain(row.main_text),
    comment1: toPlain(row.comment1),
    comment2: toPlain(row.comment2),
    created_at: toPlain(row.created_at),
    updated_at: toPlain(row.updated_at),
    template_id: toPlain(row.template_id) || null,
    theme: toPlain(row.theme) || null,
    plan_status: toPlain(row.plan_status) || null,
  } as ScheduledPostRow;
}

export async function insertScheduledPost(params: {
  scheduleId: string;
  planId?: string | null;
  scheduledTimeIso: string;
  status: string;
  mainText: string;
  comment1: string;
  comment2: string;
}) {
  await ensureScheduledPostsTable();
  const sql = `
    INSERT INTO \`${PROJECT_ID}.${DATASET}.${TABLE}\`
    (schedule_id, plan_id, scheduled_time, status, main_text, comment1, comment2, created_at, updated_at)
    VALUES (@scheduleId, @planId, @scheduledTime, @status, @mainText, @comment1, @comment2, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
  `;
  await client.query({
    query: sql,
    params: {
      scheduleId: params.scheduleId,
      planId: params.planId ?? null,
      scheduledTime: params.scheduledTimeIso,
      status: params.status,
      mainText: params.mainText,
      comment1: params.comment1,
      comment2: params.comment2,
    },
    types: {
      planId: 'STRING',
    },
  });
  return getScheduledPostById(params.scheduleId);
}

export async function updateScheduledPost(
  scheduleId: string,
  params: {
    planId?: string | null;
    scheduledTimeIso?: string | null;
    status?: string | null;
    mainText?: string | null;
    comment1?: string | null;
    comment2?: string | null;
  },
) {
  await ensureScheduledPostsTable();
  const sql = `
    UPDATE \`${PROJECT_ID}.${DATASET}.${TABLE}\`
    SET
      plan_id = COALESCE(@planId, plan_id),
      scheduled_time = COALESCE(@scheduledTime, scheduled_time),
      status = COALESCE(@status, status),
      main_text = COALESCE(@mainText, main_text),
      comment1 = COALESCE(@comment1, comment1),
      comment2 = COALESCE(@comment2, comment2),
      updated_at = CURRENT_TIMESTAMP()
    WHERE schedule_id = @scheduleId
  `;
  await client.query({
    query: sql,
    params: {
      scheduleId,
      planId: params.planId ?? null,
      scheduledTime: params.scheduledTimeIso ?? null,
      status: params.status ?? null,
      mainText: params.mainText ?? null,
      comment1: params.comment1 ?? null,
      comment2: params.comment2 ?? null,
    },
    types: {
      planId: 'STRING',
      scheduledTime: 'TIMESTAMP',
      status: 'STRING',
      mainText: 'STRING',
      comment1: 'STRING',
      comment2: 'STRING',
    },
  });
  return getScheduledPostById(scheduleId);
}

export async function deleteScheduledPost(scheduleId: string) {
  await ensureScheduledPostsTable();
  const sql = `
    DELETE FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
    WHERE schedule_id = @scheduleId
  `;
  await client.query({ query: sql, params: { scheduleId } });
}

export function toJstIsoString(dateTime: string) {
  if (!dateTime) return '';
  const trimmed = dateTime.trim();
  const timezoneMatch = trimmed.match(/([+-]\d{2}:\d{2}|Z)$/);
  if (timezoneMatch) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  }
  const normalized = trimmed.replace(' ', 'T');
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const parsed = new Date(`${withSeconds}+09:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}
