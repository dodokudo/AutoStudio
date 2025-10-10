import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

const DATASET_ID = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid date format');
  }

  if (startDate.getTime() > endDate.getTime()) {
    return {
      start: end,
      end: start,
    };
  }

  return { start, end };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!isValidDate(startParam) || !isValidDate(endParam)) {
    return NextResponse.json({ error: 'start and end query parameters (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let start: string;
  let end: string;

  try {
    ({ start, end } = normalizeDateRange(startParam, endParam));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  try {
    const [threads, instagram, youtube, organic, og] = await Promise.all([
      countLineSourceRegistrations(PROJECT_ID, { startDate: start, endDate: end, sourceName: 'Threads', datasetId: DATASET_ID }),
      countLineSourceRegistrations(PROJECT_ID, { startDate: start, endDate: end, sourceName: 'Instagram', datasetId: DATASET_ID }),
      countLineSourceRegistrations(PROJECT_ID, { startDate: start, endDate: end, sourceName: 'Youtube', datasetId: DATASET_ID }),
      countLineSourceRegistrations(PROJECT_ID, { startDate: start, endDate: end, sourceName: 'Organic', datasetId: DATASET_ID }),
      countLineSourceRegistrations(PROJECT_ID, { startDate: start, endDate: end, sourceName: 'OG', datasetId: DATASET_ID }),
    ]);

    const organicTotal = organic + og;

    const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
    const [rows] = await client.query<{ total: bigint | number | string | null }>({
      query: `
        SELECT COUNT(DISTINCT user_id) AS total
        FROM \`${PROJECT_ID}.${DATASET_ID}.user_core\`
        WHERE DATE(friend_added_at) BETWEEN @startDate AND @endDate
      `,
      params: { startDate: start, endDate: end },
    });

    const totalValue = rows?.[0]?.total;
    const total =
      typeof totalValue === 'number'
        ? totalValue
        : typeof totalValue === 'bigint'
          ? Number(totalValue)
          : typeof totalValue === 'string'
            ? Number(totalValue) || 0
            : 0;

    const other = Math.max(0, total - (threads + instagram + youtube + organicTotal));

    const response = {
      range: { start, end },
      threads,
      instagram,
      youtube,
      organic: organicTotal,
      other,
      total,
      generatedAt: toIsoDate(new Date()),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[api/line/source-counts] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch source counts' }, { status: 500 });
  }
}
