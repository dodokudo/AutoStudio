export const REFERRAL_RATE = 0.2;
export const SALESPERSON_RATE = 0.1;
export const SALESPERSON_START = '2026-11-01';
export const COURSE_SALES_CATEGORIES = new Set(['frontend', 'backend']);
export type AttributionStatus = 'unknown' | 'none' | 'assigned';
export interface SalesAttribution {
  revenueKey: string;
  referralStatus: AttributionStatus;
  referrerName: string;
  salespersonStatus: AttributionStatus;
  salespersonName: string;
}
export interface CommissionRevenue {
  id: string;
  revenueKey?: string;
  customerName?: string;
  amount: number;
  category: string;
  paymentDate: string;
}

export function defaultAttribution(item: CommissionRevenue): SalesAttribution {
  const course = COURSE_SALES_CATEGORIES.has(item.category);
  return { revenueKey: item.revenueKey ?? item.id,
    referralStatus: course ? 'unknown' : 'none', referrerName: '',
    salespersonStatus: 'none', salespersonName: '' };
}

export function calculateCommission(item: CommissionRevenue, attribution?: SalesAttribution) {
  if (!COURSE_SALES_CATEGORIES.has(item.category)) {
    return { referral: 0, salesperson: 0, total: 0, pending: false, attribution: defaultAttribution(item) };
  }
  const rule = attribution ?? defaultAttribution(item);
  const referral = rule.referralStatus === 'assigned' ? Math.round(item.amount * REFERRAL_RATE) : 0;
  const salesperson = item.paymentDate >= SALESPERSON_START && rule.salespersonStatus === 'assigned'
    ? Math.round(item.amount * SALESPERSON_RATE) : 0;
  const pending = rule.referralStatus === 'unknown' ||
    (rule.referralStatus === 'assigned' && !rule.referrerName.trim()) ||
    (item.paymentDate >= SALESPERSON_START && (rule.salespersonStatus === 'unknown' ||
      (rule.salespersonStatus === 'assigned' && !rule.salespersonName.trim())));
  return { referral, salesperson, total: referral + salesperson, pending, attribution: rule };
}

export function validateAttribution(value: unknown): value is SalesAttribution {
  if (!value || typeof value !== 'object') return false;
  const row = value as SalesAttribution;
  const valid = (status: string, name: string) => ['unknown', 'none', 'assigned'].includes(status) &&
    typeof name === 'string' && name.length <= 120 && (status !== 'assigned' || !!name.trim());
  return typeof row.revenueKey === 'string' && /^(charge|manual):[^\s]{1,200}$/.test(row.revenueKey) &&
    valid(row.referralStatus, row.referrerName) && valid(row.salespersonStatus, row.salespersonName);
}
