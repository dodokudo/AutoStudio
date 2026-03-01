import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { LaunchKpi } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;

const DEFAULT_KPI: LaunchKpi = {
  kgi: { target: 0, unitPrice: 0 },
  inflow: {
    threads: { target: 0, actual: 0 },
    instagram: { target: 0, actual: 0 },
    ads: { target: 0, actual: 0, budget: 0 },
  },
  lineRegistration: { existing: 0, newTarget: 0, newActual: 0 },
  videoViewers: { target: 0, actual: 0, existingTarget: 0, existingActual: 0, newTarget: 0, newActual: 0 },
  seminarApplications: { target: 0, actual: 0, existingTarget: 0, existingActual: 0, newTarget: 0, newActual: 0 },
  seminarDays: [],
  frontend: { unitPrice: 0, target: 0, actual: 0 },
  backend: { unitPrice: 0, isVariable: false, target: 0, actual: 0, revenue: 0 },
};

/**
 * GET: KPIデータを取得
 * データがなければデフォルト値を返す
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ funnelId: string }> },
) {
  try {
    const { funnelId } = await params;

    if (!funnelId) {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }

    const bq = createBigQueryClient(PROJECT_ID);

    try {
      const [rows] = await bq.query({
        query: `SELECT data FROM \`${TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
        useLegacySql: false,
        params: { funnelId },
      });

      if (!rows || rows.length === 0) {
        return NextResponse.json({ kpi: DEFAULT_KPI, isDefault: true });
      }

      const parsed: LaunchKpi = JSON.parse((rows[0] as any).data);
      return NextResponse.json({ kpi: parsed, isDefault: false });
    } catch (e: unknown) {
      const err = e as { message?: string; code?: number };
      if (err?.message?.includes('Not found') || err?.code === 404) {
        return NextResponse.json({ kpi: DEFAULT_KPI, isDefault: true });
      }
      throw e;
    }
  } catch (error) {
    console.error('Failed to fetch KPI:', error);
    return NextResponse.json({ error: 'Failed to fetch KPI' }, { status: 500 });
  }
}

/**
 * PUT: KPIデータを全上書き保存（DELETE + INSERT）
 * body: LaunchKpi
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ funnelId: string }> },
) {
  try {
    const { funnelId } = await params;

    if (!funnelId) {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }

    const body: LaunchKpi = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid KPI data' }, { status: 400 });
    }

    const bq = createBigQueryClient(PROJECT_ID);
    const dataJson = JSON.stringify(body);

    // DELETE + INSERT（BigQuery大容量JSON更新のルールに従う）
    await bq.query({
      query: `DELETE FROM \`${TABLE}\` WHERE funnel_id = @funnelId`,
      useLegacySql: false,
      params: { funnelId },
    });

    await bq.query({
      query: `
        INSERT INTO \`${TABLE}\` (funnel_id, data, updated_at)
        VALUES (@funnelId, @data, CURRENT_TIMESTAMP())
      `,
      useLegacySql: false,
      params: { funnelId, data: dataJson },
    });

    // 反映を検証
    const [verifyRows] = await bq.query({
      query: `SELECT data FROM \`${TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
      useLegacySql: false,
      params: { funnelId },
    });

    if (!verifyRows || verifyRows.length === 0) {
      return NextResponse.json({ error: 'KPI save failed: verification failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, funnelId });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (err?.message?.includes('Not found') || err?.code === 404) {
      return NextResponse.json(
        { error: 'launch_kpi テーブルが未作成です。' },
        { status: 503 },
      );
    }
    console.error('Failed to save KPI:', error);
    return NextResponse.json({ error: 'Failed to save KPI' }, { status: 500 });
  }
}
