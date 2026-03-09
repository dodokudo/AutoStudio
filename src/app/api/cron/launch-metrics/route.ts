import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { LSTEP_DATASET } from '@/lib/launch-constants';

export const dynamic = 'force-dynamic';

/**
 * Launch metrics cron endpoint (2時間ごと実行)
 * 1. メトリクスサマリーを返す
 * 2. KPI sync-tags を自動実行（タグ→KPI反映）
 *
 * Actual scraping runs on Cloud Run Job (autostudio-lstep-metrics) every 15 minutes.
 */
export async function GET(request: Request) {
  try {
    const projectId = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
    const dataset = LSTEP_DATASET;
    const bq = createBigQueryClient(projectId);

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

    // KPI sync-tags を自動実行（全登録ファネルに対して）
    const syncResults: Record<string, unknown> = {};
    try {
      const [kpiRows] = await bq.query({
        query: `SELECT DISTINCT funnel_id FROM \`${projectId}.${dataset}.launch_kpi\``,
        useLegacySql: false,
      });

      for (const row of kpiRows ?? []) {
        const funnelId = (row as { funnel_id: string }).funnel_id;
        try {
          // 自分自身のsync-tags APIを内部呼び出し
          const origin = new URL(request.url).origin;
          const res = await fetch(`${origin}/api/launch/kpi/${funnelId}/sync-tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await res.json();
          syncResults[funnelId] = { success: res.ok, ...data };
        } catch (e) {
          syncResults[funnelId] = { success: false, error: String(e) };
        }
      }
    } catch (e) {
      syncResults._error = String(e);
    }

    return NextResponse.json({
      success: true,
      note: 'Metrics collection runs on Cloud Run Job every 15 minutes. KPI sync runs here.',
      summary: {
        broadcastCount: summary.broadcast_count ?? 0,
        metricCount: summary.metric_count ?? 0,
        lastMeasuredAt: summary.last_measured_at ?? null,
      },
      kpiSync: syncResults,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
