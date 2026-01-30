import { NextResponse } from 'next/server';
import { getTotalsByRange } from '@/lib/home/monthly-actuals';
import { getKpiTarget, getDefaultKpiTarget } from '@/lib/home/kpi-targets';

function isValidMonth(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}$/.test(value);
}

function formatMonthRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number);
  const start = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const end = new Date(year, monthNum, 0).toISOString().split('T')[0];
  return { start, end };
}

function buildNarrative(rows: Array<{ label: string; actual: number; target: number; rate: number }>) {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return [
    `${best.label}が最も順調（達成率${best.rate.toFixed(1)}%）。`,
    `${worst.label}が最も遅れ（達成率${worst.rate.toFixed(1)}%）。`,
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month (YYYY-MM) is required' }, { status: 400 });
  }

  try {
    const { start, end } = formatMonthRange(month);
    const totals = await getTotalsByRange(start, end);
    const target = (await getKpiTarget(month)) ?? getDefaultKpiTarget(month);

    const rows = [
      { label: '売上', actual: totals.revenue, target: target.targetRevenue },
      { label: 'LINE登録', actual: totals.lineRegistrations, target: target.targetLineRegistrations },
      { label: 'フロント購入', actual: totals.frontendPurchases, target: target.targetFrontendPurchases },
      { label: 'バック購入', actual: totals.backendPurchases, target: target.targetBackendPurchases },
      { label: 'Threads', actual: totals.threadsFollowerDelta, target: target.targetThreadsFollowers },
      { label: 'Instagram', actual: totals.instagramFollowerDelta, target: target.targetInstagramFollowers },
    ].map((row) => ({
      ...row,
      rate: row.target > 0 ? (row.actual / row.target) * 100 : 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period: { start, end },
        month,
        actuals: totals,
        target,
        metrics: rows,
        narrative: buildNarrative(rows),
      },
    });
  } catch (error) {
    console.error('[api/home/report/monthly] Error:', error);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
