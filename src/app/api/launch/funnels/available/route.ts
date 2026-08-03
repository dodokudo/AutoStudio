import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);

/**
 * GET: ファネルビルダーの全ファネル一覧（id + name のみ、軽量）
 * 登録用プルダウンに使用
 */
export async function GET() {
  try {
    const bq = createBigQueryClient(PROJECT_ID);

    const [rows] = await bq.query({
      query: `
        SELECT
          id,
          JSON_VALUE(data, '$.name') as name
        FROM \`${PROJECT_ID}.marketing.funnels\`
        WHERE JSON_VALUE(data, '$.studentId') IS NULL
          AND COALESCE(JSON_VALUE(data, '$.isTemplate'), 'false') != 'true'
        ORDER BY updated_at DESC
      `,
      useLegacySql: false,
    });

    const funnels = (rows ?? []).map((row: any) => ({
      id: row.id,
      name: row.name || 'Untitled',
    }));

    return NextResponse.json({ funnels });
  } catch (error) {
    console.error('Failed to fetch available funnels:', error);
    return NextResponse.json({ error: 'Failed to fetch funnels' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'プロジェクト名を入力してください' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'プロジェクト名は100文字以内で入力してください' }, { status: 400 });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const id = `line-project-${randomUUID()}`;
    const funnel = {
      id,
      name,
      description: '',
      folderId: null,
      isTemplate: false,
      baseDate: date,
      baseDateDays: 1,
      baseDateLabel: '配信日',
      startDate: date,
      endDate: date,
      entryPoints: [],
      segments: [{ id: 'all', name: '全員', color: '#6B7280', isDefault: true, contentMode: 'delivery' }],
      deliveries: [],
      connections: [],
      transitions: [],
      canvasNodes: [],
      canvasEdges: [],
      branchPoints: [],
      taskCategories: [],
      documentContent: '',
      mindmapContent: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const bq = createBigQueryClient(PROJECT_ID);
    await bq.query({
      query: `
        INSERT INTO \`${PROJECT_ID}.marketing.funnels\` (id, data, created_at, updated_at)
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

    return NextResponse.json({ funnel }, { status: 201 });
  } catch (error) {
    console.error('Failed to create LINE project:', error);
    return NextResponse.json({ error: 'プロジェクトを作成できませんでした' }, { status: 500 });
  }
}
