import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const JOB_TABLE = 'thread_post_jobs';

export async function POST() {
  try {
    console.log('[debug/cleanup-jobs] Starting job cleanup...');

    const client: BigQuery = createBigQueryClient(PROJECT_ID);

    // Delete failed jobs from today
    const deleteSql = `
      DELETE FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
      WHERE status = 'failed'
        AND DATE(created_at, "Asia/Tokyo") = CURRENT_DATE("Asia/Tokyo")
    `;

    console.log('[debug/cleanup-jobs] Executing delete SQL:', deleteSql);
    const [deleteJob] = await client.query({ query: deleteSql });

    // Count remaining jobs
    const countSql = `
      SELECT COUNT(*) as job_count
      FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
      WHERE DATE(created_at, "Asia/Tokyo") = CURRENT_DATE("Asia/Tokyo")
    `;

    const [countRows] = await client.query({ query: countSql });
    const remainingJobs = countRows[0]?.job_count || 0;

    return NextResponse.json({
      success: true,
      deletedJobs: (deleteJob as { metadata?: { numDmlAffectedRows?: string } }).metadata?.numDmlAffectedRows || '0',
      remainingJobs: String(remainingJobs),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[debug/cleanup-jobs] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}