import { NextResponse } from 'next/server';
import { getSalesSummary } from '@/lib/univapay/client';
import { getChargeCategories, getManualSales } from '@/lib/sales/categories';
import { getAllGroups } from '@/lib/sales/groups';
import { getCustomerProfiles } from '@/lib/sales/customerProfiles';
import { getAnalycaCustomerIdentities } from '@/lib/sales/analycaCustomers';
import { getLineRegistrationsDailyByDateRange } from '@/lib/lstep/analytics';
import { resolveProjectId } from '@/lib/bigquery';
import { enrichSalesIdentities } from '@/lib/sales/elmeIdentities';
import { createSalesNameResolver, isUnknownSalesName } from '@/lib/sales/identity';
import { getCurrentSalesCustomerLinks } from '@/lib/sales/customerLinks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LSTEP_PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : undefined;
})();
const CUSTOMER_DATA_START = '2020-01-01';

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getDashboard(startParam: string, endParam: string) {
  const startDate = new Date(`${startParam}T00:00:00+09:00`);
  const endDate = new Date(`${endParam}T23:59:59.999+09:00`);

  const startDateStr = startParam;
  const endDateStr = endParam;

  const cashflowStart = new Date(startDate);
  cashflowStart.setDate(cashflowStart.getDate() - 31);
  const cashflowStartDate = cashflowStart.toISOString();

  const now = new Date();
  const monthlyEndDateStr = new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
  const monthlyStart = new Date(`${monthlyEndDateStr.slice(0, 7)}-01T00:00:00Z`);
  monthlyStart.setUTCMonth(monthlyStart.getUTCMonth() - 11);
  const monthlyStartDateStr = monthlyStart.toISOString().slice(0, 10);
  const monthlyStartDate = new Date(`${monthlyStartDateStr}T00:00:00+09:00`).toISOString();
  const monthlyEndDate = now.toISOString();

  const [
    summary,
    cashflowSummary,
    monthlySummary,
    manualSales,
    monthlyManualSales,
    customerSummary,
    customerManualSales,
    groupsMap,
    customerProfiles,
    analycaCustomers,
    lineDailyRegistrations,
    customerLinks,
  ] = await Promise.all([
    getSalesSummary(startDate.toISOString(), endDate.toISOString()),
    getSalesSummary(cashflowStartDate, endDate.toISOString()),
    getSalesSummary(monthlyStartDate, monthlyEndDate),
    getManualSales(startDateStr, endDateStr),
    getManualSales(monthlyStartDateStr, monthlyEndDateStr),
    getSalesSummary(`${CUSTOMER_DATA_START}T00:00:00+09:00`, endDate.toISOString()),
    getManualSales(CUSTOMER_DATA_START, endDateStr),
    getAllGroups().catch(() => new Map()),
    getCustomerProfiles().catch(() => []),
    getAnalycaCustomerIdentities().catch((error) => {
      console.error('[api/sales/dashboard] Failed to load ANALYCA customers:', error);
      return [];
    }),
    LSTEP_PROJECT_ID
      ? getLineRegistrationsDailyByDateRange(
          LSTEP_PROJECT_ID,
          CUSTOMER_DATA_START,
          endDateStr,
        ).catch(() => [])
      : Promise.resolve([]),
    getCurrentSalesCustomerLinks().catch((error) => {
      console.error('[api/sales/dashboard] Customer identity links unavailable:', error);
      return null;
    }),
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

  const customerChargeIds = customerSummary.charges.map(c => c.id);
  const customerCategoriesMap = await getChargeCategories(customerChargeIds);
  const customerCategories: Record<string, string> = {};
  for (const [id, cat] of customerCategoriesMap) {
    customerCategories[id] = cat;
  }

  const allCharges = [...new Map([...customerSummary.charges, ...monthlySummary.charges, ...summary.charges, ...cashflowSummary.charges].map((charge) => [charge.id, charge])).values()];
  const identityResult = await enrichSalesIdentities(allCharges, customerProfiles);
  const enrichedById = new Map(identityResult.charges.map((charge) => [charge.id, charge]));
  const enrich = (charges: typeof summary.charges) => charges.map((charge) => enrichedById.get(charge.id) ?? charge);
  const resolveName = createSalesNameResolver(customerProfiles);
  const enrichManual = (sales: typeof manualSales) => sales.map((sale) => ({ ...sale, customerName: resolveName(sale.customerName) }));

  // Explicit saved categories win. Product metadata provides a fallback for new charges.
  for (const charge of allCharges) {
    const metadata = charge.metadata ?? {};
    const courseName = metadata.courseName ?? Object.entries(metadata).find(([key]) => key.replace(/[^a-zA-Z]/g, '') === 'courseName')?.[1];
    const category = metadata.analycaUserId ? 'analyca'
      : courseName === 'Threads×AI運用マスター講座' ? 'frontend' : undefined;
    if (!category) continue;
    for (const map of [categories, monthlyCategories, customerCategories]) {
      if (!map[charge.id]) map[charge.id] = category;
    }
  }

  const groups = Array.from(groupsMap.values()).map(({ group, items }) => ({
    id: group.id,
    name: isUnknownSalesName(group.name) ? '' : resolveName(group.name),
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
    charges: enrich(summary.charges),
    cashflowCharges: enrich(cashflowSummary.charges),
    dateRange: {
      from: startDateStr,
      to: endDateStr,
    },
    categories,
    manualSales: enrichManual(manualSales),
    identityWarnings: [...identityResult.warnings, ...(customerLinks === null ? ['顧客IDの対応表を取得できませんでした。再読み込みしてください。'] : [])],
    customerLinks: customerLinks ?? [],
    groups,
    customerProfiles,
    analycaCustomers,
    lineDailyRegistrations,
    monthlyData: {
      charges: enrich(monthlySummary.charges),
      categories: monthlyCategories,
      manualSales: enrichManual(monthlyManualSales),
      groups,
      rangeStart: monthlyStartDateStr,
      rangeEnd: monthlyEndDateStr,
    },
    customerData: {
      charges: enrich(customerSummary.charges),
      categories: customerCategories,
      manualSales: enrichManual(customerManualSales),
      groups,
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!isValidDate(startParam) || !isValidDate(endParam)) {
    return NextResponse.json({ error: 'start/end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  try {
    const data = await getDashboard(startParam, endParam);

    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('[api/sales/dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to load sales dashboard' }, { status: 500 });
  }
}
