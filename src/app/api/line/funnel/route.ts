import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { resolveProjectId } from '@/lib/bigquery';
import {
  analyzeFunnel,
  listFunnelDefinitions,
  saveFunnelDefinition,
  type FunnelDefinition,
} from '@/lib/lstep/funnel';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const getCachedFunnelList = unstable_cache(
  async (projectId: string) => {
    return listFunnelDefinitions(projectId);
  },
  ['line-funnel-list'],
  { revalidate: 1800 }
);

const getCachedAnalysis = unstable_cache(
  async (
    projectId: string,
    definitionJson: string,
    startDate?: string,
    endDate?: string,
    segmentFilter?: 'all' | 'new' | 'existing',
    segmentCutoffDate?: string,
  ) => {
    const definition = JSON.parse(definitionJson) as FunnelDefinition;
    const options: Parameters<typeof analyzeFunnel>[2] = {};
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    }
    if (segmentFilter && segmentFilter !== 'all' && segmentCutoffDate) {
      options.segmentFilter = segmentFilter;
      options.segmentCutoffDate = segmentCutoffDate;
    }
    return analyzeFunnel(projectId, definition, Object.keys(options).length > 0 ? options : undefined);
  },
  ['line-funnel-analysis'],
  { revalidate: 1800 }
);

/**
 * GET: ファネル定義一覧を取得
 */
export async function GET() {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const customFunnels = await getCachedFunnelList(PROJECT_ID);

    return NextResponse.json({
      custom: customFunnels,
    });
  } catch (error) {
    console.error('[api/line/funnel] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list funnels' },
      { status: 500 }
    );
  }
}

/**
 * PUT: ファネル定義を保存（作成・更新）
 */
export async function PUT(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, name, description, steps } = body;

    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: 'name and steps are required' },
        { status: 400 }
      );
    }

    const saved = await saveFunnelDefinition(PROJECT_ID, {
      id,
      name,
      description,
      steps,
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error('[api/line/funnel] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save funnel' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { funnelDefinition, startDate, endDate, segmentFilter, segmentCutoffDate } = body;

    const definition: FunnelDefinition | null = funnelDefinition ?? null;

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

    // セグメントフィルタの検証
    const validSegmentFilters = ['all', 'new', 'existing'] as const;
    const parsedSegmentFilter = validSegmentFilters.includes(segmentFilter) ? segmentFilter as 'all' | 'new' | 'existing' : undefined;
    const parsedCutoffDate = isValidDate(segmentCutoffDate) ? segmentCutoffDate : undefined;

    const result = await getCachedAnalysis(
      PROJECT_ID,
      JSON.stringify(definition),
      dateOptions?.startDate,
      dateOptions?.endDate,
      parsedSegmentFilter,
      parsedCutoffDate,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[api/line/funnel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze funnel' },
      { status: 500 }
    );
  }
}
