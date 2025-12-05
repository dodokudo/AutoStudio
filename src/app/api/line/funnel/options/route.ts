import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { getAvailableTagColumns } from '@/lib/lstep/funnel';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

/**
 * GET: ファネルステップに使用可能なタグカラム一覧を取得
 */
export async function GET() {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const tagColumns = await getAvailableTagColumns(PROJECT_ID);

    return NextResponse.json({
      columns: tagColumns,
    });
  } catch (error) {
    console.error('[api/line/funnel/options] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get tag columns' },
      { status: 500 }
    );
  }
}
