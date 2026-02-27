import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export const dynamic = 'force-dynamic';

/**
 * Launch metrics status endpoint.
 * Actual scraping runs on Cloud Run Job (autostudio-lstep-metrics) every 15 minutes.
 * This endpoint returns the latest metrics summary from BigQuery.
 */
export async function GET() {
  try {
    const projectId = process.env.LSTEP_BQ_PROJECT_ID || 'mark-454114';
    const dataset = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
    const bq = new BigQuery({ projectId });

    const [rows] = await bq.query({
      query: `
        SELECT
          COUNT(DISTINCT broadcast_id) AS broadcast_count,
          COUNT(*) AS metric_count,
          MAX(measured_at) AS last_measured_at
        FROM \`${projectId}.${dataset}.broadcast_metrics\`
      `,
      useLegacySql: false,
    });

    const summary = rows?.[0] ?? {};

    return NextResponse.json({
      success: true,
      note: 'Metrics collection runs on Cloud Run Job (autostudio-lstep-metrics) every 15 minutes',
      summary: {
        broadcastCount: summary.broadcast_count ?? 0,
        metricCount: summary.metric_count ?? 0,
        lastMeasuredAt: summary.last_measured_at ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
