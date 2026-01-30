import { NextResponse } from 'next/server';
import { getPurchaseCountsByDateRange } from '@/lib/home/monthly-actuals';

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
    return { start: end, end: start };
  }

  return { start, end };
}

export async function GET(request: Request) {
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
    const counts = await getPurchaseCountsByDateRange(start, end);
    return NextResponse.json({
      range: { start, end },
      frontend: counts.frontend,
      backend: counts.backend,
    });
  } catch (error) {
    console.error('[api/home/purchase-counts] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase counts' }, { status: 500 });
  }
}
