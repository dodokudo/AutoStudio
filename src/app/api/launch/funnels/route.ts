import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);

export async function GET() {
  try {
    const bq = createBigQueryClient(PROJECT_ID);

    const query = `
      SELECT
        id,
        JSON_VALUE(data, '$.name') as name,
        JSON_VALUE(data, '$.description') as description,
        JSON_VALUE(data, '$.startDate') as start_date,
        JSON_VALUE(data, '$.endDate') as end_date,
        JSON_VALUE(data, '$.baseDate') as base_date,
        JSON_VALUE(data, '$.baseDateLabel') as base_date_label,
        JSON_QUERY(data, '$.deliveries') as deliveries_json,
        JSON_QUERY(data, '$.segments') as segments_json,
        CAST(updated_at AS STRING) as updated_at
      FROM \`mark-454114.marketing.funnels\`
      WHERE JSON_VALUE(data, '$.isTemplate') IS NULL
        OR JSON_VALUE(data, '$.isTemplate') = 'false'
      ORDER BY updated_at DESC
    `;

    const [rows] = await bq.query({ query, useLegacySql: false });

    const funnels = (rows ?? []).map((row: any) => {
      let deliveries = [];
      let segments = [];
      try { deliveries = JSON.parse(row.deliveries_json || '[]'); } catch {}
      try { segments = JSON.parse(row.segments_json || '[]'); } catch {}

      return {
        id: row.id,
        name: row.name || 'Untitled',
        description: row.description || '',
        startDate: row.start_date,
        endDate: row.end_date,
        baseDate: row.base_date,
        baseDateLabel: row.base_date_label,
        deliveryCount: deliveries.length,
        segmentCount: segments.length,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({ funnels });
  } catch (error) {
    console.error('Failed to fetch funnels:', error);
    return NextResponse.json({ error: 'Failed to fetch funnels' }, { status: 500 });
  }
}
