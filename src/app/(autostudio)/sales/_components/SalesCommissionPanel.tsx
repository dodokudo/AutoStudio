'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { calculateCommission, type CommissionRevenue, type SalesAttribution } from '@/lib/sales/commissions';

export function SalesCommissionPanel({ items, attributions }: {
  items: CommissionRevenue[];
  attributions: SalesAttribution[];
}) {
  const map = useMemo(() => new Map(attributions.map((a) => [a.revenueKey, a])), [attributions]);
  const rows = items.map((item) => ({ item, ...calculateCommission(item, map.get(item.revenueKey ?? item.id)) }));
  const payouts = new Map<string, number>();
  for (const row of rows) {
    if (row.referral) payouts.set(`紹介：${row.attribution.referrerName}`, (payouts.get(`紹介：${row.attribution.referrerName}`) ?? 0) + row.referral);
    if (row.salesperson) payouts.set(`営業：${row.attribution.salespersonName}`, (payouts.get(`営業：${row.attribution.salespersonName}`) ?? 0) + row.salesperson);
  }
  return <Card className="p-6">
    <h2 className="text-lg font-semibold">紹介・営業報酬</h2>
    <div className="mt-4 flex flex-wrap gap-4 text-sm">
      <span>紹介報酬 ¥{rows.reduce((sum, row) => sum + row.referral, 0).toLocaleString('ja-JP')}</span>
      <span>営業報酬 ¥{rows.reduce((sum, row) => sum + row.salesperson, 0).toLocaleString('ja-JP')}</span>
    </div>
    {payouts.size > 0 && <div className="mt-3 space-y-1 text-sm">{[...payouts].map(([name, amount]) => <p key={name}>{name}：¥{amount.toLocaleString('ja-JP')}</p>)}</div>}
  </Card>;
}
