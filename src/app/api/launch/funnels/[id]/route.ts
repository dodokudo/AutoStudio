import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const bq = createBigQueryClient(PROJECT_ID);

    // Fetch funnel data
    const funnelQuery = `
      SELECT data, CAST(updated_at AS STRING) as updated_at
      FROM \`mark-454114.marketing.funnels\`
      WHERE id = @id
    `;
    const [funnelRows] = await bq.query({
      query: funnelQuery,
      useLegacySql: false,
      params: { id },
    });

    if (!funnelRows || funnelRows.length === 0) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    const funnel = typeof funnelRows[0].data === 'string'
      ? JSON.parse(funnelRows[0].data)
      : funnelRows[0].data;
    funnel.updatedAt = funnelRows[0].updated_at;

    // Fetch broadcast metrics for this funnel's date range
    const dataset = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
    let broadcastMetrics: any[] = [];

    try {
      const metricsQuery = `
        SELECT
          broadcast_id,
          broadcast_name,
          sent_at,
          delivery_count,
          open_count,
          open_rate,
          elapsed_minutes,
          CAST(measured_at AS STRING) as measured_at
        FROM \`${PROJECT_ID}.${dataset}.broadcast_metrics\`
        ORDER BY broadcast_id, elapsed_minutes
      `;
      const [metricRows] = await bq.query({ query: metricsQuery, useLegacySql: false });
      broadcastMetrics = metricRows ?? [];
    } catch {
      // Table might be empty or not exist yet
    }

    // Fetch URL click metrics
    let urlMetrics: any[] = [];
    try {
      const urlQuery = `
        SELECT
          url_id,
          url_name,
          total_clicks,
          unique_visitors,
          click_rate,
          CAST(measured_at AS STRING) as measured_at
        FROM \`${PROJECT_ID}.${dataset}.url_click_metrics\`
        ORDER BY url_id, measured_at
      `;
      const [urlRows] = await bq.query({ query: urlQuery, useLegacySql: false });
      urlMetrics = urlRows ?? [];
    } catch {
      // Table might be empty
    }

    return NextResponse.json({
      funnel,
      broadcastMetrics,
      urlMetrics,
    });
  } catch (error) {
    console.error('Failed to fetch funnel detail:', error);
    return NextResponse.json({ error: 'Failed to fetch funnel detail' }, { status: 500 });
  }
}
