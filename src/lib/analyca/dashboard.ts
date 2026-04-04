import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export type AnalycaDashboardTab = 'summary' | 'funnel' | 'plans' | 'contracts';

export interface AnalycaDashboardData {
  period: {
    start: string;
    end: string;
    latestGaDate: string | null;
    gaLinked: boolean;
  };
  kpis: {
    revenue: number;
    mrr: number;
    activeMembers: number;
    paidMembers: number;
    trialMembers: number;
    lpViews: number;
    checkoutStarts: number;
    checkoutPageViews: number;
    paymentSubmits: number;
    purchases: number;
    lpToCheckoutRate: number | null;
    checkoutToSubmitRate: number | null;
    submitToPurchaseRate: number | null;
    purchaseRate: number | null;
  };
  planBreakdown: AnalycaPlanBreakdown[];
  dailyFunnel: AnalycaDailyFunnelRow[];
  contracts: AnalycaContractRow[];
}

export interface AnalycaPlanBreakdown {
  key: string;
  label: string;
  activeMembers: number;
  paidMembers: number;
  trialMembers: number;
  mrr: number;
  revenue: number;
  purchases: number;
}

export interface AnalycaDailyFunnelRow {
  date: string;
  lpViews: number;
  checkoutStarts: number;
  checkoutPageViews: number;
  paymentSubmits: number;
  purchases: number;
  revenue: number;
  lpToCheckoutRate: number | null;
  checkoutToSubmitRate: number | null;
  submitToPurchaseRate: number | null;
  purchaseRate: number | null;
}

export interface AnalycaContractRow {
  id: string;
  purchasedAt: string;
  amount: number;
  status: string;
  customerName: string;
  customerPhone: string;
  planLabel: string;
  accountStatus: string;
  accountId: string | null;
  accountHandle: string;
}

interface PlanSummaryRow {
  plan_key: string | null;
  subscription_status: string | null;
  users: number | string | null;
}

interface RevenueRow {
  plan_key: string | null;
  revenue: number | string | null;
  purchases: number | string | null;
}

interface DailyRevenueRow {
  date: string;
  revenue: number | string | null;
  purchases: number | string | null;
}

interface DailyGaRow {
  date: string;
  lp_views: number | string | null;
  checkout_starts: number | string | null;
  checkout_page_views: number | string | null;
  payment_submits: number | string | null;
}

interface ContractQueryRow {
  charge_id: string;
  purchased_at: string | null;
  created_on: { value: string } | string | null;
  subscription_id: string | null;
  amount: number | string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  plan_key: string | null;
}

interface ContractUserRow {
  user_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  subscription_status: string | null;
  created_at: { value: string } | string | null;
  instagram_username: string | null;
  threads_username: string | null;
}

const ANALYTICS_DATASET_ID = 'analytics_489007096';
const ANALYCA_DATASET_ID = 'analyca';
const SALES_DATASET_ID = 'autostudio_sales';
const PROJECT_ID = resolveProjectId();
const ACTIVE_MEMBER_STATUSES = new Set(['trial', 'active', 'current']);
const PAID_MEMBER_STATUSES = new Set(['active', 'current']);

const PLAN_LABELS: Record<string, string> = {
  light: 'Light',
  'light-threads': 'Light',
  'light-threads-yearly': 'Light 年払い',
  'light-instagram': 'Light',
  standard: 'Standard',
  'standard-yearly': 'Standard 年払い',
  pro: 'Pro',
  'pro-yearly': 'Pro 年払い',
  unknown: '未判定',
};

const PLAN_MONTHLY_MRR: Record<string, number> = {
  light: 4980,
  'light-threads': 4980,
  'light-threads-yearly': 3980,
  'light-instagram': 4980,
  standard: 9800,
  'standard-yearly': 7840,
  pro: 19000,
  'pro-yearly': 15200,
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toGaSuffix(dateKey: string): string {
  return dateKey.replaceAll('-', '');
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value) || 0;
}

function normalizePlanKey(planId: string | null | undefined, amount?: number): string {
  if (
    planId === 'light-threads'
    || planId === 'light-instagram'
    || planId === 'light'
    || planId === 'legacy_4980'
  ) {
    return 'light';
  }
  if (planId === 'standard' || planId === 'legacy_11000' || planId === 'legacy_9800') return 'standard';
  if (planId === 'pro' || planId === 'legacy_19000') return 'pro';
  if (planId === 'light-threads-yearly') return 'light-threads-yearly';
  if (planId === 'standard-yearly') return 'standard-yearly';
  if (planId === 'pro-yearly') return 'pro-yearly';
  if (planId) return planId;
  if (amount === 4980) return 'light';
  if (amount === 11000 || amount === 9800) return 'standard';
  if (amount === 19000) return 'pro';
  return 'unknown';
}

function getPlanLabel(planKey: string): string {
  return PLAN_LABELS[planKey] ?? planKey;
}

function calcRate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function toTimestampValue(value: { value: string } | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || '';
}

function enumerateDates(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

async function getLatestGaDate(): Promise<string | null> {
  const client = createBigQueryClient(PROJECT_ID, 'US');

  try {
    const [rows] = await client.query({
      query: `
        SELECT MAX(table_name) AS latest_table
        FROM \`${PROJECT_ID}.${ANALYTICS_DATASET_ID}.INFORMATION_SCHEMA.TABLES\`
        WHERE STARTS_WITH(table_name, 'events_')
      `,
      location: 'US',
    });
    const latestTable = rows?.[0]?.latest_table ? String(rows[0].latest_table) : '';
    if (!latestTable.startsWith('events_')) return null;
    const suffix = latestTable.replace('events_', '');
    if (!/^\d{8}$/.test(suffix)) return null;
    return `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`;
  } catch (error) {
    console.error('[analyca/dashboard] failed to fetch latest GA date:', error);
    return null;
  }
}

async function hasChargesSubscriptionIdColumn(): Promise<boolean> {
  const client = createBigQueryClient(PROJECT_ID);

  try {
    const [rows] = await client.query({
      query: `
        SELECT 1 AS exists_flag
        FROM \`${PROJECT_ID}.${SALES_DATASET_ID}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'charges'
          AND column_name = 'subscription_id'
        LIMIT 1
      `,
    });
    return rows.length > 0;
  } catch (error) {
    console.error('[analyca/dashboard] failed to inspect charges schema:', error);
    return false;
  }
}

async function getPlanSummaries(): Promise<Map<string, AnalycaPlanBreakdown>> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        COALESCE(plan_id, 'unknown') AS plan_key,
        COALESCE(subscription_status, 'none') AS subscription_status,
        COUNT(*) AS users
      FROM \`${PROJECT_ID}.${ANALYCA_DATASET_ID}.users\`
      GROUP BY plan_key, subscription_status
    `,
  });

  const planMap = new Map<string, AnalycaPlanBreakdown>();
  (rows as PlanSummaryRow[]).forEach((row) => {
    const planKey = normalizePlanKey(row.plan_key);
    const status = String(row.subscription_status ?? 'none');
    const entry = planMap.get(planKey) ?? {
      key: planKey,
      label: getPlanLabel(planKey),
      activeMembers: 0,
      paidMembers: 0,
      trialMembers: 0,
      mrr: 0,
      revenue: 0,
      purchases: 0,
    };
    const users = toNumber(row.users);
    if (ACTIVE_MEMBER_STATUSES.has(status)) entry.activeMembers += users;
    if (PAID_MEMBER_STATUSES.has(status)) {
      entry.paidMembers += users;
      entry.mrr += users * (PLAN_MONTHLY_MRR[planKey] ?? 0);
    }
    if (status === 'trial') entry.trialMembers += users;
    planMap.set(planKey, entry);
  });

  return planMap;
}

async function attachRevenueToPlans(
  planMap: Map<string, AnalycaPlanBreakdown>,
  startDateISO: string,
  endDateISO: string,
): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        CASE
          WHEN c.charged_amount = 4980 THEN 'legacy_4980'
          WHEN c.charged_amount = 11000 THEN 'legacy_11000'
          WHEN c.charged_amount = 9800 THEN 'legacy_9800'
          WHEN c.charged_amount = 19000 THEN 'legacy_19000'
          ELSE 'unknown'
        END AS plan_key,
        SUM(c.charged_amount) AS revenue,
        COUNT(*) AS purchases
      FROM \`${PROJECT_ID}.${SALES_DATASET_ID}.charges\` c
      JOIN \`${PROJECT_ID}.${SALES_DATASET_ID}.charge_categories\` cat
        ON c.id = cat.charge_id
      WHERE cat.category = 'analyca'
        AND c.status = 'successful'
        AND c.mode = 'live'
        AND c.created_on >= TIMESTAMP(@startDate)
        AND c.created_on <= TIMESTAMP(@endDate)
      GROUP BY plan_key
    `,
    params: { startDate: startDateISO, endDate: endDateISO },
  });

  (rows as RevenueRow[]).forEach((row) => {
    const planKey = normalizePlanKey(row.plan_key);
    const entry = planMap.get(planKey) ?? {
      key: planKey,
      label: getPlanLabel(planKey),
      activeMembers: 0,
      paidMembers: 0,
      trialMembers: 0,
      mrr: 0,
      revenue: 0,
      purchases: 0,
    };
    entry.revenue += toNumber(row.revenue);
    entry.purchases += toNumber(row.purchases);
    planMap.set(planKey, entry);
  });
}

async function getDailyRevenue(startDateISO: string, endDateISO: string): Promise<Map<string, { revenue: number; purchases: number }>> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(c.created_on, 'Asia/Tokyo')) AS date,
        SUM(c.charged_amount) AS revenue,
        COUNT(*) AS purchases
      FROM \`${PROJECT_ID}.${SALES_DATASET_ID}.charges\` c
      JOIN \`${PROJECT_ID}.${SALES_DATASET_ID}.charge_categories\` cat
        ON c.id = cat.charge_id
      WHERE cat.category = 'analyca'
        AND c.status = 'successful'
        AND c.mode = 'live'
        AND c.created_on >= TIMESTAMP(@startDate)
        AND c.created_on <= TIMESTAMP(@endDate)
      GROUP BY date
      ORDER BY date
    `,
    params: { startDate: startDateISO, endDate: endDateISO },
  });

  const map = new Map<string, { revenue: number; purchases: number }>();
  (rows as DailyRevenueRow[]).forEach((row) => {
    map.set(String(row.date), {
      revenue: toNumber(row.revenue),
      purchases: toNumber(row.purchases),
    });
  });
  return map;
}

async function getDailyGaFunnel(
  startDateKey: string,
  endDateKey: string,
): Promise<Map<string, { lpViews: number; checkoutStarts: number; checkoutPageViews: number; paymentSubmits: number }>> {
  const client = createBigQueryClient(PROJECT_ID, 'US');
  try {
    const [rows] = await client.query({
      query: `
        WITH events AS (
          SELECT
            PARSE_DATE('%Y%m%d', event_date) AS event_day,
            event_name,
            user_pseudo_id,
            (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location
          FROM \`${PROJECT_ID}.${ANALYTICS_DATASET_ID}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN @startSuffix AND @endSuffix
            AND event_name IN ('page_view', 'begin_checkout', 'add_payment_info')
        )
        SELECT
          FORMAT_DATE('%Y-%m-%d', event_day) AS date,
          COUNTIF(
            event_name = 'page_view'
            AND REGEXP_CONTAINS(
              COALESCE(page_location, ''),
              r'^https?://[^/]+(/(\\?.*)?|/pricing(\\?.*)?)$'
            )
          ) AS lp_views,
          COUNTIF(event_name = 'begin_checkout') AS checkout_starts,
          COUNTIF(
            event_name = 'page_view'
            AND REGEXP_CONTAINS(
              COALESCE(page_location, ''),
              r'^https?://[^/]+/checkout(\\?.*)?$'
            )
          ) AS checkout_page_views,
          COUNTIF(event_name = 'add_payment_info') AS payment_submits
        FROM events
        GROUP BY date
        ORDER BY date
      `,
      params: {
        startSuffix: toGaSuffix(startDateKey),
        endSuffix: toGaSuffix(endDateKey),
      },
      location: 'US',
    });

    const map = new Map<string, { lpViews: number; checkoutStarts: number; checkoutPageViews: number; paymentSubmits: number }>();
    (rows as DailyGaRow[]).forEach((row) => {
      map.set(String(row.date), {
        lpViews: toNumber(row.lp_views),
        checkoutStarts: toNumber(row.checkout_starts),
        checkoutPageViews: toNumber(row.checkout_page_views),
        paymentSubmits: toNumber(row.payment_submits),
      });
    });
    return map;
  } catch (error) {
    console.error('[analyca/dashboard] failed to fetch GA funnel:', error);
    return new Map();
  }
}

async function getContracts(startDateISO: string, endDateISO: string): Promise<AnalycaContractRow[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const subscriptionIdSelect = await hasChargesSubscriptionIdColumn()
    ? 'c.subscription_id AS subscription_id'
    : 'CAST(NULL AS STRING) AS subscription_id';

  const [chargeRows, userRows] = await Promise.all([
    client.query({
      query: `
      SELECT
        c.id AS charge_id,
        FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', c.created_on, 'Asia/Tokyo') AS purchased_at,
        c.created_on AS created_on,
        ${subscriptionIdSelect},
        c.charged_amount AS amount,
        c.status AS status,
        JSON_VALUE(c.metadata, '$."univapay-name"') AS customer_name,
        JSON_VALUE(c.metadata, '$."univapay-phone-number"') AS customer_phone,
        CASE
          WHEN c.charged_amount = 4980 THEN 'legacy_4980'
          WHEN c.charged_amount = 11000 THEN 'legacy_11000'
          WHEN c.charged_amount = 9800 THEN 'legacy_9800'
          WHEN c.charged_amount = 19000 THEN 'legacy_19000'
          ELSE 'unknown'
        END AS plan_key
      FROM \`${PROJECT_ID}.${SALES_DATASET_ID}.charges\` c
      JOIN \`${PROJECT_ID}.${SALES_DATASET_ID}.charge_categories\` cat
        ON c.id = cat.charge_id
      WHERE cat.category = 'analyca'
        AND c.status = 'successful'
        AND c.mode = 'live'
        AND c.created_on >= TIMESTAMP(@startDate)
        AND c.created_on <= TIMESTAMP(@endDate)
      ORDER BY c.created_on DESC
      LIMIT 300
    `,
      params: { startDate: startDateISO, endDate: endDateISO },
    }),
    client.query({
      query: `
        SELECT
          user_id,
          subscription_id,
          plan_id,
          subscription_status,
          created_at,
          instagram_username,
          threads_username
        FROM \`${PROJECT_ID}.${ANALYCA_DATASET_ID}.users\`
        ORDER BY created_at ASC
      `,
    }),
  ]);

  const users = (userRows[0] as ContractUserRow[]).map((user) => ({
    userId: String(user.user_id),
    subscriptionId: user.subscription_id ? String(user.subscription_id) : null,
    planKey: normalizePlanKey(user.plan_id),
    status: String(user.subscription_status ?? 'none'),
    createdAtMs: Date.parse(toTimestampValue(user.created_at)),
    handle: user.instagram_username || user.threads_username || '-',
  }));

  const linkedUsersByCustomer = new Map<string, (typeof users)[number]>();
  const usersBySubscriptionId = new Map(
    users
      .filter((user) => user.subscriptionId)
      .map((user) => [user.subscriptionId as string, user]),
  );
  const usedUserIds = new Set<string>();

  const chargesAsc = (chargeRows[0] as ContractQueryRow[])
    .map((row) => ({
      row,
      chargeAtMs: Date.parse(toTimestampValue(row.created_on)),
      amount: toNumber(row.amount),
      planKey: normalizePlanKey(row.plan_key, toNumber(row.amount)),
      customerKey: `${String(row.customer_name ?? '')}|${String(row.customer_phone ?? '')}`.trim(),
      subscriptionId: row.subscription_id ? String(row.subscription_id) : null,
    }))
    .sort((a, b) => a.chargeAtMs - b.chargeAtMs);

  chargesAsc.forEach(({ chargeAtMs, planKey, customerKey, subscriptionId }) => {
    if (subscriptionId) {
      const directUser = usersBySubscriptionId.get(subscriptionId);
      if (directUser && customerKey && customerKey !== '|') {
        linkedUsersByCustomer.set(customerKey, directUser);
        usedUserIds.add(directUser.userId);
        return;
      }
    }

    if (!customerKey || customerKey === '|') return;
    if (linkedUsersByCustomer.has(customerKey)) return;

    const matchedUser = users
      .filter((user) => {
        if (usedUserIds.has(user.userId)) return false;
        const withinWindow = user.createdAtMs >= chargeAtMs - 60 * 60 * 1000
          && user.createdAtMs <= chargeAtMs + 72 * 60 * 60 * 1000;
        if (!withinWindow) return false;
        return user.planKey === planKey || user.planKey === 'unknown';
      })
      .sort((a, b) => Math.abs(a.createdAtMs - chargeAtMs) - Math.abs(b.createdAtMs - chargeAtMs))[0];

    if (matchedUser) {
      linkedUsersByCustomer.set(customerKey, matchedUser);
      usedUserIds.add(matchedUser.userId);
    }
  });

  return (chargeRows[0] as ContractQueryRow[]).map((row) => {
    const amount = toNumber(row.amount);
    const customerName = row.customer_name ? String(row.customer_name) : '未取得';
    const customerPhone = row.customer_phone ? String(row.customer_phone) : '未取得';
    const customerKey = `${String(row.customer_name ?? '')}|${String(row.customer_phone ?? '')}`.trim();
    const directAccount = row.subscription_id ? usersBySubscriptionId.get(String(row.subscription_id)) : undefined;
    const account = directAccount
      ?? (customerKey && customerKey !== '|' ? linkedUsersByCustomer.get(customerKey) : undefined);

    return {
      id: String(row.charge_id),
      purchasedAt: String(row.purchased_at ?? ''),
      amount,
      status: String(row.status ?? ''),
      customerName,
      customerPhone,
      planLabel: getPlanLabel(normalizePlanKey(row.plan_key, amount)),
      accountStatus: account ? '発行済み' : '未発行',
      accountId: account?.userId ?? null,
      accountHandle: account?.handle ?? '-',
    };
  });
}

export async function getAnalycaDashboardData(params: {
  startDate: Date;
  endDate: Date;
}): Promise<AnalycaDashboardData> {
  const startDateKey = toDateKey(params.startDate);
  const endDateKey = toDateKey(params.endDate);
  const startDateISO = params.startDate.toISOString();
  const endDateISO = params.endDate.toISOString();
  const dates = enumerateDates(params.startDate, params.endDate);

  const [planMap, dailyRevenueMap, dailyGaMap, contracts, latestGaDate] = await Promise.all([
    getPlanSummaries(),
    getDailyRevenue(startDateISO, endDateISO),
    getDailyGaFunnel(startDateKey, endDateKey),
    getContracts(startDateISO, endDateISO),
    getLatestGaDate(),
  ]);

  await attachRevenueToPlans(planMap, startDateISO, endDateISO);

  const planBreakdown = Array.from(planMap.values()).sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return b.activeMembers - a.activeMembers;
  });

  const dailyFunnel = dates.map((date) => {
    const ga = dailyGaMap.get(date) ?? {
      lpViews: 0,
      checkoutStarts: 0,
      checkoutPageViews: 0,
      paymentSubmits: 0,
    };
    const revenue = dailyRevenueMap.get(date) ?? { revenue: 0, purchases: 0 };
    return {
      date,
      lpViews: ga.lpViews,
      checkoutStarts: ga.checkoutStarts,
      checkoutPageViews: ga.checkoutPageViews,
      paymentSubmits: ga.paymentSubmits,
      purchases: revenue.purchases,
      revenue: revenue.revenue,
      lpToCheckoutRate: calcRate(ga.checkoutStarts, ga.lpViews),
      checkoutToSubmitRate: calcRate(ga.paymentSubmits, ga.checkoutPageViews),
      submitToPurchaseRate: calcRate(revenue.purchases, ga.paymentSubmits),
      purchaseRate: calcRate(revenue.purchases, ga.lpViews),
    };
  });

  const kpis = {
    revenue: planBreakdown.reduce((sum, row) => sum + row.revenue, 0),
    mrr: planBreakdown.reduce((sum, row) => sum + row.mrr, 0),
    activeMembers: planBreakdown.reduce((sum, row) => sum + row.activeMembers, 0),
    paidMembers: planBreakdown.reduce((sum, row) => sum + row.paidMembers, 0),
    trialMembers: planBreakdown.reduce((sum, row) => sum + row.trialMembers, 0),
    lpViews: dailyFunnel.reduce((sum, row) => sum + row.lpViews, 0),
    checkoutStarts: dailyFunnel.reduce((sum, row) => sum + row.checkoutStarts, 0),
    checkoutPageViews: dailyFunnel.reduce((sum, row) => sum + row.checkoutPageViews, 0),
    paymentSubmits: dailyFunnel.reduce((sum, row) => sum + row.paymentSubmits, 0),
    purchases: dailyFunnel.reduce((sum, row) => sum + row.purchases, 0),
    lpToCheckoutRate: null as number | null,
    checkoutToSubmitRate: null as number | null,
    submitToPurchaseRate: null as number | null,
    purchaseRate: null as number | null,
  };
  kpis.lpToCheckoutRate = calcRate(kpis.checkoutStarts, kpis.lpViews);
  kpis.checkoutToSubmitRate = calcRate(kpis.paymentSubmits, kpis.checkoutPageViews);
  kpis.submitToPurchaseRate = calcRate(kpis.purchases, kpis.paymentSubmits);
  kpis.purchaseRate = calcRate(kpis.purchases, kpis.lpViews);

  return {
    period: {
      start: startDateKey,
      end: endDateKey,
      latestGaDate,
      gaLinked: !!latestGaDate,
    },
    kpis,
    planBreakdown,
    dailyFunnel,
    contracts,
  };
}
