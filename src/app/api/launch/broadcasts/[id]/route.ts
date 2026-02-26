import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const bq = createBigQueryClient(PROJECT_ID);

    const query = `
      SELECT
        broadcast_id,
        broadcast_name,
        sent_at,
        delivery_count,
        open_count,
        open_rate,
        elapsed_minutes,
        CAST(measured_at AS STRING) as measured_at
      FROM \`${PROJECT_ID}.${DATASET}.broadcast_metrics\`
      WHERE broadcast_id = @id
      ORDER BY elapsed_minutes ASC
    `;

    const [rows] = await bq.query({
      query,
      useLegacySql: false,
      params: { id },
    });

    // Also fetch URL metrics linked to this broadcast
    // (For now, return all URL metrics - linking will be improved later)
    let urlMetrics: any[] = [];
    try {
      const urlQuery = `
        SELECT
          url_id,
          url_name,
          total_clicks,
          unique_visitors,
          click_rate,
          elapsed_minutes,
          CAST(measured_at AS STRING) as measured_at
        FROM \`${PROJECT_ID}.${DATASET}.url_click_metrics\`
        ORDER BY measured_at ASC
      `;
      const [urlRows] = await bq.query({ query: urlQuery, useLegacySql: false });
      urlMetrics = urlRows ?? [];
    } catch {}

    return NextResponse.json({
      timeSeries: rows ?? [],
      urlMetrics,
    });
  } catch (error) {
    console.error('Failed to fetch broadcast detail:', error);
    return NextResponse.json({ timeSeries: [], urlMetrics: [] });
  }
}
