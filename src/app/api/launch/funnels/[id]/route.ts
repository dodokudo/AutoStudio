import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const editorOnly = new URL(request.url).searchParams.get('editor') === '1';

  try {
    const bq = createBigQueryClient(PROJECT_ID);

    // Fetch funnel data
    const funnelQuery = `
      SELECT data, CAST(updated_at AS STRING) as updated_at
      FROM \`${PROJECT_ID}.marketing.funnels\`
      WHERE id = @id
        AND JSON_VALUE(data, '$.studentId') IS NULL
        AND COALESCE(JSON_VALUE(data, '$.isTemplate'), 'false') != 'true'
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

    // The editor only needs the funnel JSON. Avoid loading the full metrics
    // history, which makes opening large projects unnecessarily slow.
    if (editorOnly) {
      return NextResponse.json({ funnel });
    }

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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !Array.isArray(body.segments) || !Array.isArray(body.deliveries)) {
      return NextResponse.json({ error: 'Invalid funnel data' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const funnel = {
      ...body,
      id,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    const bq = createBigQueryClient(PROJECT_ID);
    const [existingRows] = await bq.query({
      query: `
        SELECT id
        FROM \`${PROJECT_ID}.marketing.funnels\`
        WHERE id = @id
          AND JSON_VALUE(data, '$.studentId') IS NULL
          AND COALESCE(JSON_VALUE(data, '$.isTemplate'), 'false') != 'true'
        LIMIT 1
      `,
      useLegacySql: false,
      params: { id },
    });

    if (!existingRows?.length) {
      return NextResponse.json({ error: 'LINE project not found' }, { status: 404 });
    }

    await bq.query({
      query: `
        MERGE \`${PROJECT_ID}.marketing.funnels\` AS target
        USING (SELECT @id AS id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN
          UPDATE SET data = PARSE_JSON(@data), updated_at = TIMESTAMP(@updatedAt)
        WHEN NOT MATCHED THEN
          INSERT (id, data, created_at, updated_at)
          VALUES (@id, PARSE_JSON(@data), TIMESTAMP(@createdAt), TIMESTAMP(@updatedAt))
      `,
      useLegacySql: false,
      params: {
        id,
        data: JSON.stringify(funnel),
        createdAt: funnel.createdAt,
        updatedAt: funnel.updatedAt,
      },
    });

    return NextResponse.json({ funnel });
  } catch (error) {
    console.error('Failed to save funnel detail:', error);
    return NextResponse.json({ error: 'Failed to save funnel detail' }, { status: 500 });
  }
}
