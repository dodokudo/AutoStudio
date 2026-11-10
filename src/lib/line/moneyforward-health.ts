import type { BankBalance } from './bank-balances';

// Twice-daily collection tolerates one delayed run, but never silently uses older data.
const MAX_AGE_MS = 30 * 60 * 60 * 1000;

function timestamp(value: string | null, jst = false): number {
  if (!value) return NaN;
  return Date.parse(jst && !/(Z|[+-]\d{2}:\d{2})$/.test(value) ? `${value}+09:00` : value);
}

export function bankBalanceIssue(balance: BankBalance, now = new Date()): string | null {
  if (balance.amount == null) return '未取得';
  if (balance.status !== 'ok') return '連携エラー';
  const updated = timestamp(balance.updatedAt, true);
  if (!Number.isFinite(updated) || updated > now.getTime() || now.getTime() - updated > MAX_AGE_MS) {
    return '更新停止';
  }
  return null;
}

export function expenseIsAvailable(
  endDate: string,
  syncedAt: string | null,
  balances: BankBalance[] | null,
  now = new Date(),
): boolean {
  const synced = timestamp(syncedAt);
  const dayEnd = Date.parse(`${endDate}T00:00:00+09:00`) + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(synced) || synced < dayEnd || synced > now.getTime() || now.getTime() - synced > MAX_AGE_MS) return false;
  // A completed scrape of stale MoneyForward data is not a successful bank refresh.
  return Boolean(balances?.length && balances.every((balance) =>
    !bankBalanceIssue(balance, now) && timestamp(balance.updatedAt, true) >= dayEnd,
  ));
}
