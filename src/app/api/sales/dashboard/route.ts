import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSalesSummary } from '@/lib/univapay/client';
import { getChargeCategories, getManualSales } from '@/lib/sales/categories';
import { getAllGroups } from '@/lib/sales/groups';
import { getLstepAnalytics } from '@/lib/lstep/analytics';
import { resolveProjectId } from '@/lib/bigquery';
import { formatDateInput } from '@/lib/dateRangePresets';

const LSTEP_PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : undefined;
})();

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const getCachedDashboard = unstable_cache(
  async (startParam: string, endParam: string) => {
    const startDate = new Date(`${startParam}T00:00:00`);
    const endDate = new Date(`${endParam}T23:59:59`);

    const startDateStr = formatDateInput(startDate);
    const endDateStr = formatDateInput(endDate);

    const cashflowStart = new Date(startDate);
    cashflowStart.setDate(cashflowStart.getDate() - 31);
    const cashflowStartDate = cashflowStart.toISOString();

    const monthlyStart = new Date();
    monthlyStart.setHours(0, 0, 0, 0);
    monthlyStart.setMonth(monthlyStart.getMonth() - 11);
    monthlyStart.setDate(1);
    const monthlyEnd = new Date();
    monthlyEnd.setHours(0, 0, 0, 0);
    const monthlyStartDate = monthlyStart.toISOString();
    const monthlyEndDate = monthlyEnd.toISOString();
    const monthlyStartDateStr = formatDateInput(monthlyStart);
    const monthlyEndDateStr = formatDateInput(monthlyEnd);

    const [
      summary,
      cashflowSummary,
      monthlySummary,
      manualSales,
      monthlyManualSales,
      groupsMap,
      lstepAnalytics,
    ] = await Promise.all([
      getSalesSummary(startDate.toISOString(), endDate.toISOString()),
      getSalesSummary(cashflowStartDate, endDate.toISOString()),
      getSalesSummary(monthlyStartDate, monthlyEndDate),
      getManualSales(startDateStr, endDateStr),
      getManualSales(monthlyStartDateStr, monthlyEndDateStr),
      getAllGroups().catch(() => new Map()),
      LSTEP_PROJECT_ID ? getLstepAnalytics(LSTEP_PROJECT_ID).catch(() => null) : Promise.resolve(null),
    ]);

    const chargeIds = summary.charges.map(c => c.id);
    const categoriesMap = await getChargeCategories(chargeIds);
    const categories: Record<string, string> = {};
    for (const [id, cat] of categoriesMap) {
      categories[id] = cat;
    }

    const monthlyChargeIds = monthlySummary.charges.map(c => c.id);
    const monthlyCategoriesMap = await getChargeCategories(monthlyChargeIds);
    const monthlyCategories: Record<string, string> = {};
    for (const [id, cat] of monthlyCategoriesMap) {
      monthlyCategories[id] = cat;
    }

    const groups = Array.from(groupsMap.values()).map(({ group, items }) => ({
      id: group.id,
      name: group.name,
      items: items.map((i: { itemType: 'charge' | 'manual'; itemId: string }) => ({
        itemType: i.itemType,
        itemId: i.itemId,
      })),
    }));

    return {
      summary: {
        totalAmount: summary.totalAmount,
        successfulCount: summary.successfulCount,
        failedCount: summary.failedCount,
        pendingCount: summary.pendingCount,
      },
      charges: summary.charges,
      cashflowCharges: cashflowSummary.charges,
      dateRange: {
        from: startDateStr,
        to: endDateStr,
      },
      categories,
      manualSales,
      groups,
      lineDailyRegistrations: lstepAnalytics?.dailyRegistrations ?? [],
      monthlyData: {
        charges: monthlySummary.charges,
        categories: monthlyCategories,
        manualSales: monthlyManualSales,
        groups,
        rangeStart: monthlyStartDateStr,
        rangeEnd: monthlyEndDateStr,
      },
    };
  },
  ['sales-dashboard'],
  { revalidate: 1800 }
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!isValidDate(startParam) || !isValidDate(endParam)) {
    return NextResponse.json({ error: 'start/end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  try {
    const data = await getCachedDashboard(startParam, endParam);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[api/sales/dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to load sales dashboard' }, { status: 500 });
  }
}
