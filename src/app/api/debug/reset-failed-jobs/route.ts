import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = resolveProjectId();
const bigquery = new BigQuery({ projectId: PROJECT_ID });

export async function POST(request: NextRequest) {
  try {
    console.log('[debug/reset-failed-jobs] Starting failed job reset...');

    // Query to find failed jobs with 'Plan not found for job' error
    const query = `
      SELECT job_id, plan_id, status, error_message, updated_at
      FROM \`${PROJECT_ID}.autostudio.job_logs\`
      WHERE status = 'failed'
      AND error_message LIKE '%Plan not found for job%'
      ORDER BY updated_at DESC
      LIMIT 50
    `;

    const [rows] = await bigquery.query(query);
    console.log(`[debug/reset-failed-jobs] Found ${rows.length} failed jobs with 'Plan not found' error`);

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No failed jobs with "Plan not found" error found',
        resetCount: 0
      });
    }

    // Reset failed jobs by updating their status
    const resetJobIds: string[] = [];
    for (const row of rows) {
      const jobId = row.job_id;
      const planId = row.plan_id;

      // Update job status to 'pending' for retry
      const updateQuery = `
        UPDATE \`${PROJECT_ID}.autostudio.job_logs\`
        SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP()
        WHERE job_id = @jobId
      `;

      await bigquery.query({
        query: updateQuery,
        params: { jobId }
      });

      resetJobIds.push(jobId);
      console.log(`[debug/reset-failed-jobs] Reset job ${jobId} for plan ${planId}`);
    }

    console.log(`[debug/reset-failed-jobs] Successfully reset ${resetJobIds.length} failed jobs`);

    return NextResponse.json({
      success: true,
      message: `Successfully reset ${resetJobIds.length} failed jobs`,
      resetCount: resetJobIds.length,
      resetJobIds
    });
  } catch (error) {
    console.error('[debug/reset-failed-jobs] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    return NextResponse.json({
      error: 'Failed to reset failed jobs',
      details: errorMessage
    }, { status: 500 });
  }
}