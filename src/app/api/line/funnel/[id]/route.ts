import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import {
  getFunnelDefinition,
  deleteFunnelDefinition,
} from '@/lib/lstep/funnel';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: ファネル定義を取得
 */
export async function GET(_request: Request, { params }: RouteParams) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const funnel = await getFunnelDefinition(PROJECT_ID, id);

    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    return NextResponse.json(funnel);
  } catch (error) {
    console.error('[api/line/funnel/[id]] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get funnel' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: ファネル定義を削除
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    await deleteFunnelDefinition(PROJECT_ID, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/line/funnel/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete funnel' },
      { status: 500 }
    );
  }
}
