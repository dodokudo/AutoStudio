import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

export async function GET() {
  try {
    const client = createBigQueryClient(PROJECT_ID);

    // スケジュールされたコメントの状況を確認
    const query = `
      SELECT
        schedule_id,
        plan_id,
        parent_thread_id,
        comment_order,
        comment_text,
        scheduled_time,
        status,
        created_at,
        CURRENT_TIMESTAMP() as current_time,
        TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), scheduled_time, SECOND) as seconds_since_scheduled
      FROM \`${PROJECT_ID}.${DATASET}.comment_schedules\`
      ORDER BY scheduled_time DESC
      LIMIT 20
    `;

    const [rows] = await client.query({ query });

    return NextResponse.json({
      success: true,
      schedules: rows,
      count: rows.length
    });
  } catch (error) {
    console.error('[debug/comment-schedules] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}