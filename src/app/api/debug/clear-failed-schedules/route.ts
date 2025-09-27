import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

export async function POST() {
  try {
    const client = createBigQueryClient(PROJECT_ID);

    // 失敗したスケジュールを削除
    const deleteQuery = `
      DELETE FROM \`${PROJECT_ID}.${DATASET}.comment_schedules\`
      WHERE status = 'failed'
    `;

    const [result] = await client.query({ query: deleteQuery });

    return NextResponse.json({
      success: true,
      message: 'Failed schedules cleared',
      deletedRows: Array.isArray(result) ? result.length : 'unknown'
    });
  } catch (error) {
    console.error('[debug/clear-failed-schedules] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}