import { NextResponse } from 'next/server';
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
        ORDER BY updated_at DESC
        LIMIT 50
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
