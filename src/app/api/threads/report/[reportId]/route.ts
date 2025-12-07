import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const REPORT_TABLE = 'threads_reports';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await params;
    const client = createBigQueryClient(PROJECT_ID);

    const sql = `
      SELECT report_data
      FROM \`${PROJECT_ID}.${DATASET}.${REPORT_TABLE}\`
      WHERE report_id = '${reportId}'
      LIMIT 1
    `;

    const [rows] = await client.query({ query: sql });

    if ((rows as Array<Record<string, unknown>>).length === 0) {
      return NextResponse.json({ error: 'レポートが見つかりません' }, { status: 404 });
    }

    const row = (rows as Array<Record<string, unknown>>)[0];
    let reportData = row.report_data;

    // BigQueryのJSON型は文字列として返される場合があるのでパースする
    if (typeof reportData === 'string') {
      try {
        reportData = JSON.parse(reportData);
      } catch {
        // パース失敗時はそのまま返す
      }
    }

    return NextResponse.json({ report: reportData });
  } catch (error) {
    console.error('[report/[reportId]] Error:', error);
    return NextResponse.json(
      { error: 'レポートの取得に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
