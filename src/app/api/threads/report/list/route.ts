import { NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const REPORT_TABLE = 'threads_reports';

export async function GET() {
  try {
    const client = createBigQueryClient(PROJECT_ID);

    // Check if table exists
    const checkSql = `
      SELECT COUNT(*) as cnt
      FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name = '${REPORT_TABLE}'
    `;

    const [checkRows] = await client.query({ query: checkSql });
    const tableExists = Number((checkRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;

    if (!tableExists) {
      return NextResponse.json({ reports: [] });
    }

    const sql = `
      SELECT
        report_id,
        report_type,
        period_year,
        period_month,
        start_date,
        end_date,
        created_at
      FROM \`${PROJECT_ID}.${DATASET}.${REPORT_TABLE}\`
      ORDER BY period_year DESC, period_month DESC
    `;

    const [rows] = await client.query({ query: sql });

    const reports = (rows as Array<Record<string, unknown>>).map((row) => ({
      reportId: String(row.report_id ?? ''),
      reportType: String(row.report_type ?? ''),
      periodYear: Number(row.period_year ?? 0),
      periodMonth: Number(row.period_month ?? 0),
      startDate: String(row.start_date ?? ''),
      endDate: String(row.end_date ?? ''),
      createdAt: String(row.created_at ?? ''),
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[report/list] Error:', error);
    return NextResponse.json(
      { error: 'レポート一覧の取得に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
