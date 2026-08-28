import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const searchParams = new URL(request.url).searchParams;
  const editorOnly = searchParams.get('editor') === '1';
  const includeMetrics = searchParams.get('metrics') === '1';

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
    if (editorOnly || !includeMetrics) {
      return NextResponse.json({ funnel });
    }

    // 配信タブを開いた時だけ、このファネルの期間・IDに必要な実績を取得する。
    const dataset = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
    let broadcastMetrics: any[] = [];
    const broadcastIds = Array.from(new Set<string>(
      (funnel.deliveries ?? []).flatMap((delivery: { lstepBroadcastId?: string }) => (
        delivery.lstepBroadcastId ? [delivery.lstepBroadcastId] : []
      )),
    ));

    try {
      const broadcastIdClause = broadcastIds.length > 0
        ? 'OR broadcast_id IN UNNEST(@broadcastIds)'
        : '';
      const metricsQuery = `
        WITH scoped AS (
          SELECT
            broadcast_id,
            broadcast_name,
            sent_at,
            delivery_count,
            open_count,
            open_rate,
            elapsed_minutes,
            measured_at,
            ROW_NUMBER() OVER (PARTITION BY broadcast_id ORDER BY elapsed_minutes DESC) AS latest_rank
          FROM \`${PROJECT_ID}.${dataset}.broadcast_metrics\`
          WHERE (
            SAFE_CAST(
              REPLACE(REGEXP_EXTRACT(sent_at, r'\\d{4}/\\d{1,2}/\\d{1,2}'), '/', '-')
              AS DATE
            ) BETWEEN DATE(@startDate) AND DATE(@endDate)
            ${broadcastIdClause}
          )
        )
        SELECT
          broadcast_id,
          broadcast_name,
          sent_at,
          delivery_count,
          open_count,
          open_rate,
          elapsed_minutes,
          CAST(measured_at AS STRING) AS measured_at
        FROM scoped
        WHERE elapsed_minutes <= 1440 OR latest_rank = 1
        ORDER BY broadcast_id, elapsed_minutes
      `;
      const params: Record<string, string | string[]> = {
        startDate: funnel.startDate,
        endDate: funnel.endDate,
      };
      if (broadcastIds.length > 0) params.broadcastIds = broadcastIds;
      const [metricRows] = await bq.query({ query: metricsQuery, useLegacySql: false, params });
      broadcastMetrics = metricRows ?? [];
    } catch {
      // Table might be empty or not exist yet
    }

    const clickTags = Array.from(new Set<string>(
      (funnel.deliveries ?? []).flatMap((delivery: { clickTag?: string }) => (
        delivery.clickTag ? [delivery.clickTag] : []
      )),
    ));
    const tagMetrics: Record<string, number> = {};
    if (clickTags.length > 0) {
      try {
        const [tagRows] = await bq.query({
          query: `
            SELECT tag_name, friend_count
            FROM \`${PROJECT_ID}.${dataset}.tag_metrics\`
            WHERE tag_name IN UNNEST(@clickTags)
            QUALIFY ROW_NUMBER() OVER (PARTITION BY tag_name ORDER BY measured_at DESC) = 1
          `,
          useLegacySql: false,
          params: { clickTags },
        });
        for (const row of tagRows ?? []) {
          tagMetrics[String(row.tag_name)] = Number(row.friend_count) || 0;
        }
      } catch {
        // Table might be empty or not exist yet
      }
    }

    return NextResponse.json({
      funnel,
      broadcastMetrics,
      tagMetrics,
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
