import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

/**
 * GET: 登録済みローンチ一覧を取得
 * launch_registrations テーブルから登録済みファネルIDを取得し、
 * marketing.funnels から名前・期間だけを軽量に返す
 */
export async function GET() {
  try {
    const bq = createBigQueryClient(PROJECT_ID);

    // 登録済みファネルIDを取得
    let registeredIds: string[] = [];
    try {
      const [regRows] = await bq.query({
        query: `SELECT funnel_id, label, status FROM \`${PROJECT_ID}.${DATASET}.launch_registrations\` ORDER BY created_at DESC LIMIT 100`,
        useLegacySql: false,
      });
      registeredIds = (regRows ?? []).map((r: any) => r.funnel_id);

      if (registeredIds.length === 0) {
        return NextResponse.json({ funnels: [] });
      }

      // ファネル一覧を軽量に取得（deliveries/segmentsのJSONは引かない）
      const placeholders = registeredIds.map((_, i) => `@id${i}`).join(', ');
      const params: Record<string, string> = {};
      registeredIds.forEach((id, i) => { params[`id${i}`] = id; });

      const [funnelRows] = await bq.query({
        query: `
          SELECT
            id,
            JSON_VALUE(data, '$.name') as name,
            JSON_VALUE(data, '$.description') as description,
            JSON_VALUE(data, '$.startDate') as start_date,
            JSON_VALUE(data, '$.endDate') as end_date,
            JSON_VALUE(data, '$.baseDate') as base_date,
            JSON_VALUE(data, '$.baseDateLabel') as base_date_label,
            ARRAY_LENGTH(JSON_QUERY_ARRAY(data, '$.deliveries')) as delivery_count,
            ARRAY_LENGTH(JSON_QUERY_ARRAY(data, '$.segments')) as segment_count,
            CAST(updated_at AS STRING) as updated_at
          FROM \`${PROJECT_ID}.marketing.funnels\`
          WHERE id IN (${placeholders})
        `,
        useLegacySql: false,
        params,
      });

      // 登録情報とマージ
      const regMap = new Map((regRows ?? []).map((r: any) => [r.funnel_id, r]));

      const funnels = (funnelRows ?? []).map((row: any) => {
        const reg = regMap.get(row.id) as any;
        return {
          id: row.id,
          name: row.name || 'Untitled',
          description: row.description || '',
          startDate: row.start_date,
          endDate: row.end_date,
          baseDate: row.base_date,
          baseDateLabel: row.base_date_label,
          deliveryCount: row.delivery_count || 0,
          segmentCount: row.segment_count || 0,
          updatedAt: row.updated_at,
          label: reg?.label || null,
          status: reg?.status || null,
        };
      });

      return NextResponse.json({ funnels });
    } catch (e: unknown) {
      // launch_registrations テーブルがまだない場合
      const err = e as { message?: string; code?: number };
      if (err?.message?.includes('Not found') || err?.code === 404) {
        return NextResponse.json({ funnels: [] });
      }
      throw e;
    }
  } catch (error) {
    console.error('Failed to fetch funnels:', error);
    return NextResponse.json({ error: 'Failed to fetch funnels' }, { status: 500 });
  }
}

/**
 * POST: ローンチを登録
 * body: { funnelId: string, label?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { funnelId, label } = body;

    if (!funnelId || typeof funnelId !== 'string') {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }

    const bq = createBigQueryClient(PROJECT_ID);

    // ファネルが存在するか確認
    const [checkRows] = await bq.query({
      query: `SELECT id, JSON_VALUE(data, '$.name') as name FROM \`${PROJECT_ID}.marketing.funnels\` WHERE id = @id`,
      useLegacySql: false,
      params: { id: funnelId },
    });

    if (!checkRows || checkRows.length === 0) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    const funnelName = (checkRows[0] as any).name || 'Untitled';

    // 重複チェック
    const [existingReg] = await bq.query({
      query: `SELECT funnel_id FROM \`${PROJECT_ID}.${DATASET}.launch_registrations\` WHERE funnel_id = @funnelId LIMIT 1`,
      useLegacySql: false,
      params: { funnelId },
    });

    if (existingReg && existingReg.length > 0) {
      return NextResponse.json(
        { error: 'このファネルは既に登録されています' },
        { status: 409 }
      );
    }

    // 登録
    await bq.query({
      query: `
        INSERT INTO \`${PROJECT_ID}.${DATASET}.launch_registrations\`
          (funnel_id, label, status, created_at)
        VALUES
          (@funnelId, @label, 'active', CURRENT_TIMESTAMP())
      `,
      useLegacySql: false,
      params: {
        funnelId,
        label: label || funnelName,
      },
    });

    return NextResponse.json({ success: true, funnelId, name: funnelName });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (err?.message?.includes('Not found') || err?.code === 404) {
      return NextResponse.json(
        { error: 'launch_registrations テーブルが未作成です。管理者に連絡してください。' },
        { status: 503 }
      );
    }
    console.error('Failed to register launch:', error);
    return NextResponse.json({ error: 'Failed to register launch' }, { status: 500 });
  }
}

/**
 * DELETE: ローンチ登録解除
 * body: { funnelId: string }
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { funnelId } = body;

    if (!funnelId) {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }

    const bq = createBigQueryClient(PROJECT_ID);

    await bq.query({
      query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.launch_registrations\` WHERE funnel_id = @funnelId`,
      useLegacySql: false,
      params: { funnelId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (err?.message?.includes('Not found') || err?.code === 404) {
      return NextResponse.json(
        { error: 'launch_registrations テーブルが未作成です。管理者に連絡してください。' },
        { status: 503 }
      );
    }
    console.error('Failed to delete registration:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
