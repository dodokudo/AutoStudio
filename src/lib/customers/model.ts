import type { Followup } from './followup';
export interface ServiceDefinition {
  id: string;
  name: string;
  categories: string[];
  products: string[];
}
export const DEFAULT_SERVICES: ServiceDefinition[] = [
  {
    id: 'frontend',
    name: 'フロントエンド',
    categories: ['frontend'],
    products: ['Threads×AI運用マスター講座'],
  },
  {
    id: 'backend',
    name: 'バックエンド',
    categories: ['backend', 'backend_renewal', 'backend_performance'],
    products: [],
  },
  { id: 'analyca', name: 'ANALYCA', categories: ['analyca'], products: [] },
];
export interface Purchase {
  id: string;
  aliases: string[];
  name: string;
  realName?: string;
  accounts?: CustomerAccount[];
  lineName?: string;
  serviceId: string | null;
  date: string | null;
  dateBasis: string;
  amount: number | null;
  amountKind: 'payment' | 'contract';
  acquisition: boolean;
  source: string;
  sourceUrl?: string;
  issue?: string;
  closingStatus?: string;
  roster?: boolean;
  membership?: 'purchased' | 'registered';
}
export interface Customer {
  id: string;
  name: string;
  lineName: string;
  accounts: CustomerAccount[];
  confirmed: boolean;
  purchases: Purchase[];
  serviceIds: string[];
  paidAmount: number;
  issue: string;
}
export interface CustomerDataset {
  purchases: Purchase[];
  services: ServiceDefinition[];
  loadedAt: string;
  sheetSnapshotAt?: string;
  followups?: Record<string, Followup>;
  warnings: string[];
  complete: boolean;
}
export function classifyService(
  category: string,
  product: string,
  services: ServiceDefinition[],
): string | null {
  const exact = services.filter((s) => product && s.products.includes(product));
  if (exact.length) return exact.length === 1 ? exact[0].id : null;
  const matches = services.filter((s) => s.categories.includes(category));
  return matches.length === 1 ? matches[0].id : null;
}
export function validateServices(value: unknown): ServiceDefinition[] {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    throw Error('サービスは1〜50件で設定してください');
  const ids = new Set(),
    names = new Set(),
    categories = new Set(),
    products = new Set();
  return value.map((s) => {
    if (
      !s ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(s.id) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 80 ||
      !Array.isArray(s.categories) ||
      !Array.isArray(s.products)
    )
      throw Error('サービスの設定を確認してください');
    if (ids.has(s.id) || names.has(s.name.trim()))
      throw Error('サービスID・名称が重複しています');
    ids.add(s.id);
    names.add(s.name.trim());
    for (const [values, seen] of [
      [s.categories, categories],
      [s.products, products],
    ] as [unknown[], Set<unknown>][]) {
      for (const v of values) {
        if (
          typeof v !== 'string' ||
          !v.trim() ||
          v.length > 200 ||
          seen.has(v.trim())
        )
          throw Error(
            '同じ分類・商品名を複数サービスに割り当てることはできません',
          );
        seen.add(v.trim());
      }
    }
    return {
      id: s.id,
      name: s.name.trim(),
      categories: s.categories.map((v: string) => v.trim()),
      products: s.products.map((v: string) => v.trim()),
    };
  });
}
export function buildCustomers(purchases: Purchase[]): Customer[] {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const p = parent.get(id);
    if (!p) {
      parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const r = root(p);
    parent.set(id, r);
    return r;
  };
  const unique = [...new Map(purchases.map((p) => [p.id, p])).values()];
  for (const p of unique) {
    const aliases = p.aliases.length ? p.aliases : [`unresolved:${p.id}`];
    const a = root(aliases[0]);
    for (const b of aliases.slice(1)) parent.set(root(b), a);
  }
  const groups = new Map<string, Purchase[]>();
  for (const p of unique) {
    const key = root(p.aliases[0] || `unresolved:${p.id}`);
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  return [...groups.values()]
    .map((rows) => {
      const aliases = [...new Set(rows.flatMap((r) => r.aliases))].sort();
      const conflict = ['elme:', 'lstep:', 'analyca:'].some(
        (prefix) => aliases.filter((a) => a.startsWith(prefix)).length > 1,
      );
      const confirmed =
        aliases.length > 0 &&
        !conflict &&
        !rows.some((r) => r.issue === '顧客IDの対応が競合');
      const id =
        aliases.find((a) => a.startsWith('elme:')) ||
        aliases[0] ||
        `unresolved:${rows[0].id}`;
      return {
        id,
        name:
          rows.find((r) => r.roster && r.realName)?.realName ||
          rows.find((r) => r.realName)?.realName ||
          '氏名未確認',
        accounts: [
          ...new Map(
            rows
              .flatMap((r) => r.accounts || [])
              .map((a) => [JSON.stringify(a), a]),
          ).values(),
        ],
        lineName: rows.find((r) => r.lineName)?.lineName || '',
        confirmed,
        purchases: rows.sort((a, b) =>
          (b.date || '').localeCompare(a.date || ''),
        ),
        serviceIds: [
          ...new Set(rows.flatMap((r) => (r.serviceId ? [r.serviceId] : []))),
        ],
        paidAmount: rows
          .filter((r) => r.amountKind === 'payment')
          .reduce((n, r) => n + (r.amount || 0), 0),
        issue: conflict
          ? '顧客IDの対応が競合'
          : !confirmed
            ? '本人の紐付けが未確認'
            : '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
const days = (a: string, b: string) =>
  (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
export type ConversionStatus =
  | 'converted'
  | 'not_converted'
  | 'observing'
  | 'prior_target'
  | 'date_unknown';
export interface ConversionMember {
  customer: Customer;
  sourceDate: string | null;
  targetDate: string | null;
  status: ConversionStatus;
  days: number | null;
}
export function conversionReport(
  customers: Customer[],
  source: string,
  target: string,
  windowDays: number | null,
  asOf: string,
) {
  const members: ConversionMember[] = [];
  for (const c of customers.filter(
    (c) => c.confirmed && hasPurchased(c, source),
  )) {
    const sourceRows = c.purchases.filter(
      (p) => p.serviceId === source && p.acquisition,
    );
    const targetRows = c.purchases.filter(
      (p) => p.serviceId === target && p.acquisition,
    );
    const first = (rows: Purchase[]) =>
      rows
        .map((r) => r.date)
        .filter((d): d is string => !!d && d <= asOf)
        .sort()[0] || null;
    const a = first(sourceRows),
      b = first(targetRows);
    let status: ConversionStatus = 'date_unknown',
      delta: number | null = null;
    if (
      a &&
      !sourceRows.some((r) => !r.date) &&
      !(
        c.serviceIds.includes(target) &&
        (!b || targetRows.some((r) => !r.date))
      )
    ) {
      if (b && b < a) status = 'prior_target';
      else if (b === a)
        status = 'date_unknown'; // Day-only data cannot establish same-day ordering.
      else {
        delta = b ? days(a, b) : null;
        status =
          windowDays !== null && days(a, asOf) < windowDays
            ? 'observing'
            : delta !== null && (windowDays === null || delta <= windowDays)
              ? 'converted'
              : 'not_converted';
      }
    }
    members.push({
      customer: c,
      sourceDate: a,
      targetDate: b,
      status,
      days: delta,
    });
  }
  const months = [
    ...new Set(
      members.flatMap((m) => (m.sourceDate ? [m.sourceDate.slice(0, 7)] : [])),
    ),
  ]
    .sort()
    .reverse();
  const cohorts = months.map((month) => {
    const rows = members.filter((m) => m.sourceDate?.startsWith(month));
    const eligible = rows.filter((m) =>
      ['converted', 'not_converted'].includes(m.status),
    );
    const converted = eligible.filter((m) => m.status === 'converted').length;
    return {
      month,
      eligible: eligible.length,
      converted,
      rate: eligible.length ? (converted / eligible.length) * 100 : null,
      observing: rows.filter((m) => m.status === 'observing').length,
      excluded: rows.filter((m) =>
        ['prior_target', 'date_unknown'].includes(m.status),
      ).length,
    };
  });
  const eligible = members.filter((m) =>
    ['converted', 'not_converted'].includes(m.status),
  );
  return {
    members,
    cohorts,
    eligible: eligible.length,
    converted: eligible.filter((m) => m.status === 'converted').length,
    rate: eligible.length
      ? (eligible.filter((m) => m.status === 'converted').length /
          eligible.length) *
        100
      : null,
    observing: members.filter((m) => m.status === 'observing').length,
    excluded: members.filter((m) =>
      ['prior_target', 'date_unknown'].includes(m.status),
    ).length,
  };
}

/** The roster is grounded in member rows and identified product accounts, not individual charges. */
export function buildCustomerRoster(purchases: Purchase[]): Customer[] {
  const relevant = purchases.filter((p) => p.serviceId);
  const members = relevant.filter((p) => p.roster);
  const normalize = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/[\s　]/g, '')
      .toLowerCase();
  const pair = (p: Purchase) => {
    const name = normalize(p.realName || p.name),
      line = normalize(p.lineName || '');
    return name && line && !['-', '不明', '未確認'].includes(line)
      ? `${name}|${line}`
      : '';
  };
  const pairs = new Map<string, Purchase[]>();
  for (const p of members) {
    const key = pair(p);
    if (key) pairs.set(key, [...(pairs.get(key) || []), p]);
  }
  const rows = relevant.map((p) => {
    if (!p.roster) return p;
    const matches = pairs.get(pair(p)) || [];
    // Require both exact name and LINE name, unique within each service. Never merge by name alone.
    const uniquePair =
      matches.length > 1 &&
      new Set(matches.map((r) => r.serviceId)).size === matches.length;
    return {
      ...p,
      aliases: [
        ...p.aliases,
        `member:${p.id}`,
        ...(uniquePair ? [`member-pair:${pair(p)}`] : []),
      ],
    };
  });
  return buildCustomers(rows).filter(
    (c) =>
      c.purchases.some((p) => p.roster) ||
      (c.confirmed &&
        c.purchases.some(
          (p) =>
            p.aliases.some((a) => a.startsWith('analyca:')) ||
            !['frontend', 'backend', 'analyca'].includes(p.serviceId || ''),
        )),
  );
}
export function hasPurchased(customer: Customer, service: string): boolean {
  return customer.purchases.some(
    (p) =>
      p.serviceId === service && p.acquisition && p.membership !== 'registered',
  );
}
export function frontendOverview(customers: Customer[], asOf: string) {
  const front = customers.filter((c) => c.serviceIds.includes('frontend'));
  const frontPurchased = front.filter((c) => hasPurchased(c, 'frontend'));
  const backend = customers.filter((c) => hasPurchased(c, 'backend'));
  const both = frontPurchased.filter((c) => hasPurchased(c, 'backend'));
  const report = conversionReport(customers, 'frontend', 'backend', null, asOf);
  return {
    front,
    frontPurchased,
    backend,
    both,
    eligible: report.eligible,
    converted: report.converted,
    rate: report.rate,
    excluded: report.excluded,
    registered: front.length - frontPurchased.length,
  };
}

export const FUNNEL_START = '2025-11-01';
export const FUNNEL_SERVICES = ['frontend', 'backend'];
export interface CustomerAccount {
  platform: string;
  name?: string;
  id?: string;
  url?: string;
}
export function firstPurchaseDate(
  customer: Customer,
  service: string,
): string | null {
  return (
    customer.purchases
      .filter(
        (p) =>
          p.serviceId === service &&
          p.acquisition &&
          p.membership !== 'registered' &&
          p.date,
      )
      .map((p) => p.date!)
      .sort()[0] || null
  );
}
export function purchasedInFunnel(
  customer: Customer,
  service: string,
  asOf: string,
): boolean {
  if (!FUNNEL_SERVICES.includes(service) || !hasPurchased(customer, service))
    return false;
  const first = firstPurchaseDate(customer, service);
  // The owner confirmed the frontend launched in Nov 2025. Undated frontend buyers belong to
  // this funnel, but their dates stay unknown and they cannot enter chronological conversion.
  return first
    ? first >= FUNNEL_START && first <= asOf
    : service === 'frontend';
}
export function funnelCustomers(
  customers: Customer[],
  asOf: string,
): Customer[] {
  return customers.filter((c) =>
    FUNNEL_SERVICES.some((s) => purchasedInFunnel(c, s, asOf)),
  );
}
export function backendOnly(customer: Customer, asOf: string): boolean {
  return (
    purchasedInFunnel(customer, 'backend', asOf) &&
    !hasPurchased(customer, 'frontend')
  );
}
export function funnelOverview(customers: Customer[], asOf: string) {
  const front = customers.filter((c) => purchasedInFunnel(c, 'frontend', asOf));
  const backend = customers.filter((c) =>
    purchasedInFunnel(c, 'backend', asOf),
  );
  const both = front.filter((c) => purchasedInFunnel(c, 'backend', asOf));
  const report = conversionReport(front, 'frontend', 'backend', null, asOf);
  return {
    front,
    backend,
    both,
    backendOnly: backend.filter((c) => backendOnly(c, asOf)),
    eligible: report.eligible,
    converted: report.converted,
    rate: report.rate,
    excluded: report.excluded,
  };
}
export type CustomerSort = 'purchase' | 'frontend' | 'backend' | 'name';
export function sortFunnelCustomers(
  customers: Customer[],
  sort: CustomerSort,
  direction: 'asc' | 'desc',
  asOf: string,
): Customer[] {
  const date = (c: Customer) =>
    sort === 'frontend' || sort === 'backend'
      ? purchasedInFunnel(c, sort, asOf)
        ? firstPurchaseDate(c, sort)
        : null
      : FUNNEL_SERVICES.filter((s) => purchasedInFunnel(c, s, asOf))
          .map((s) => firstPurchaseDate(c, s))
          .filter((d): d is string => !!d)
          .sort()[0] || null;
  return [...customers].sort((a, b) => {
    let order = 0;
    if (sort === 'name') order = a.name.localeCompare(b.name, 'ja');
    else {
      const x = date(a),
        y = date(b);
      if (!x || !y) return x ? -1 : y ? 1 : a.id.localeCompare(b.id); // Unknown is last in both directions.
      order = x.localeCompare(y);
    }
    return (direction === 'asc' ? order : -order) || a.id.localeCompare(b.id);
  });
}
