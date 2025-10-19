import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { analyzeFunnel, PRESET_FUNNEL_IGLN, PRESET_FUNNEL_SURVEY, type FunnelDefinition } from '@/lib/lstep/funnel';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { funnelDefinition, startDate, endDate, preset } = body;

    // プリセット指定の場合
    let definition: FunnelDefinition | null = null;
    if (preset === 'igln') {
      definition = PRESET_FUNNEL_IGLN;
    } else if (preset === 'survey') {
      definition = PRESET_FUNNEL_SURVEY;
    } else if (funnelDefinition) {
      definition = funnelDefinition;
    }

    if (!definition) {
      return NextResponse.json({ error: 'Funnel definition is required' }, { status: 400 });
    }

    // 日付範囲の検証
    let dateOptions: { startDate?: string; endDate?: string } | undefined;
    if (startDate && endDate) {
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
      }
      dateOptions = { startDate, endDate };
    }

    const result = await analyzeFunnel(PROJECT_ID, definition, dateOptions);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[api/line/funnel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze funnel' },
      { status: 500 }
    );
  }
}
