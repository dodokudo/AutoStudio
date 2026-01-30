import { NextResponse } from 'next/server';
import { getTotalsByRange } from '@/lib/home/monthly-actuals';
import { getKpiTarget, getDefaultKpiTarget } from '@/lib/home/kpi-targets';

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toMonth(value: string): string {
  return value.slice(0, 7);
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!isValidDate(start) || !isValidDate(end)) {
    return NextResponse.json({ error: 'start/end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  try {
    const totals = await getTotalsByRange(start, end);
    const monthKey = toMonth(start);
    const target = (await getKpiTarget(monthKey)) ?? getDefaultKpiTarget(monthKey);
    const daysInRange = daysBetween(start, end);
    const baseDays = target.workingDays > 0 ? target.workingDays : 30;
    const paceMultiplier = daysInRange / baseDays;

    const rows = [
      { label: '売上', actual: totals.revenue, target: target.targetRevenue * paceMultiplier },
      { label: 'LINE登録', actual: totals.lineRegistrations, target: target.targetLineRegistrations * paceMultiplier },
      { label: 'フロント購入', actual: totals.frontendPurchases, target: target.targetFrontendPurchases * paceMultiplier },
      { label: 'バック購入', actual: totals.backendPurchases, target: target.targetBackendPurchases * paceMultiplier },
      { label: 'Threads', actual: totals.threadsFollowerDelta, target: target.targetThreadsFollowers * paceMultiplier },
      { label: 'Instagram', actual: totals.instagramFollowerDelta, target: target.targetInstagramFollowers * paceMultiplier },
    ].map((row) => ({
      ...row,
      rate: row.target > 0 ? (row.actual / row.target) * 100 : 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        period: { start, end },
        monthKey,
        daysInRange,
        actuals: totals,
        target,
        metrics: rows,
      },
    });
  } catch (error) {
    console.error('[api/home/report/weekly] Error:', error);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
