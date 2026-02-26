import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

export async function GET() {
  try {
    const bq = createBigQueryClient(PROJECT_ID);

    // Get latest metric per broadcast (most recent measurement)
    const query = `
      WITH latest AS (
        SELECT
          broadcast_id,
          broadcast_name,
          sent_at,
          delivery_count,
          open_count,
          open_rate,
          elapsed_minutes,
          CAST(measured_at AS STRING) as measured_at,
          ROW_NUMBER() OVER (PARTITION BY broadcast_id ORDER BY measured_at DESC) as rn
        FROM \`${PROJECT_ID}.${DATASET}.broadcast_metrics\`
      )
      SELECT * EXCEPT(rn) FROM latest WHERE rn = 1
      ORDER BY sent_at DESC
    `;

    const [rows] = await bq.query({ query, useLegacySql: false });

    return NextResponse.json({ broadcasts: rows ?? [] });
  } catch (error) {
    console.error('Failed to fetch broadcasts:', error);
    return NextResponse.json({ broadcasts: [] });
  }
}
