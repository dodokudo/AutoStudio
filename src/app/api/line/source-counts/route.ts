import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { countLineRegistrationsBySource } from '@/lib/lstep/analytics';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

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
    // lstep_friends_rawテーブルから流入経路別カウントを取得
    // 登録数KPIと同じデータソースを使用することで、合計が一致する
    const sourceCounts = await countLineRegistrationsBySource(PROJECT_ID, start, end);

    const response = {
      range: { start, end },
      threads: sourceCounts.threads,
      instagram: sourceCounts.instagram,
      youtube: sourceCounts.youtube,
      organic: sourceCounts.organic,
      other: sourceCounts.other,
      total: sourceCounts.total,
      generatedAt: toIsoDate(new Date()),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[api/line/source-counts] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch source counts' }, { status: 500 });
  }
}
