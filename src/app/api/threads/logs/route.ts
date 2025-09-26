import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const LOG_TABLE = 'thread_posting_logs';
const PLAN_TABLE = 'thread_post_plans';

interface PostingLog {
  log_id: string;
  plan_id: string;
  status: string;
  posted_thread_id?: string;
  error_message?: string;
  posted_at?: string;
  created_at: string;
  main_text: string;
  template_id: string;
  theme: string;
  scheduled_time: string;
}

function toIsoDate(raw: { value?: string } | string | number | Date | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString();
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof raw === 'object' && 'value' in raw) {
    return toIsoDate(raw.value ?? undefined);
  }
  return undefined;
}

export async function GET() {
  try {
    const client = createBigQueryClient(PROJECT_ID);

    const query = `
      SELECT
        l.log_id,
        l.plan_id,
        l.status,
        l.posted_thread_id,
        l.error_message,
        l.posted_at,
        l.created_at,
        p.main_text,
        p.template_id,
        p.theme,
        p.scheduled_time
      FROM \`${PROJECT_ID}.${DATASET}.${LOG_TABLE}\` l
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` p
        ON l.plan_id = p.plan_id
      ORDER BY l.created_at DESC
      LIMIT 50
    `;

    const [rows] = await client.query({ query });

    const logs: PostingLog[] = rows.map((row: {
      log_id?: string;
      plan_id?: string;
      status?: string;
      posted_thread_id?: string;
      error_message?: string;
      posted_at?: { value?: string } | string | number | Date | null;
      created_at?: { value?: string } | string | number | Date | null;
      main_text?: string;
      template_id?: string;
      theme?: string;
      scheduled_time?: string;
    }) => ({
      log_id: row.log_id || '',
      plan_id: row.plan_id || '',
      status: row.status || 'unknown',
      posted_thread_id: row.posted_thread_id || undefined,
      error_message: row.error_message || undefined,
      posted_at: toIsoDate(row.posted_at),
      created_at: toIsoDate(row.created_at) ?? new Date().toISOString(),
      main_text: row.main_text || '',
      template_id: row.template_id || '',
      theme: row.theme || '',
      scheduled_time: row.scheduled_time || ''
    }));

    console.log(`[threads/logs] Retrieved ${logs.length} posting logs`);

    return NextResponse.json({
      logs,
      total: logs.length
    });

  } catch (error) {
    console.error('[threads/logs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve posting logs' },
      { status: 500 }
    );
  }
}
