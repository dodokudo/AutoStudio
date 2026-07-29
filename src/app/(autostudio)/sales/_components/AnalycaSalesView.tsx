'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface AnalycaRevenueItem {
  id: string;
  customerKey: string;
  customerName: string;
  amount: number;
  paymentDate: string;
}

interface AnalycaSalesViewProps {
  items: AnalycaRevenueItem[];
  dateRange: {
    from: string;
    to: string;
  };
}

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

const monthKeysBetween = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00`);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
};

export function AnalycaSalesView({ items, dateRange }: AnalycaSalesViewProps) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);

  const buyers = useMemo(() => {
    const map = new Map<string, {
      customerKey: string;
      customerName: string;
      ltv: number;
      purchaseCount: number;
      firstPaymentDate: string;
      lastPaymentDate: string;
    }>();

    for (const item of items) {
      const existing = map.get(item.customerKey);
      if (existing) {
        existing.ltv += item.amount;
        existing.purchaseCount += 1;
        if (item.paymentDate < existing.firstPaymentDate) existing.firstPaymentDate = item.paymentDate;
        if (item.paymentDate > existing.lastPaymentDate) existing.lastPaymentDate = item.paymentDate;
        continue;
      }
      map.set(item.customerKey, {
        customerKey: item.customerKey,
        customerName: item.customerName,
        ltv: item.amount,
        purchaseCount: 1,
        firstPaymentDate: item.paymentDate,
        lastPaymentDate: item.paymentDate,
      });
    }
    return Array.from(map.values());
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter(
      (item) => item.paymentDate >= dateRange.from && item.paymentDate <= dateRange.to
    ),
    [dateRange.from, dateRange.to, items],
  );

  const selectedBuyerKeys = useMemo(
    () => new Set(selectedItems.map((item) => item.customerKey)),
    [selectedItems],
  );

  const selectedBuyers = useMemo(
    () => buyers
      .filter((buyer) => selectedBuyerKeys.has(buyer.customerKey))
      .sort((a, b) => b.ltv - a.ltv),
    [buyers, selectedBuyerKeys],
  );

  const metrics = useMemo(() => {
    const revenue = selectedItems.reduce((sum, item) => sum + item.amount, 0);
    const newBuyerKeys = new Set(
      selectedBuyers
        .filter(
          (buyer) =>
            buyer.firstPaymentDate >= dateRange.from &&
            buyer.firstPaymentDate <= dateRange.to
        )
        .map((buyer) => buyer.customerKey),
    );
    const selectedBuyerLtv = selectedBuyers.reduce((sum, buyer) => sum + buyer.ltv, 0);
    return {
      revenue,
      payerCount: selectedBuyerKeys.size,
      newBuyerCount: newBuyerKeys.size,
      averageLtv:
        selectedBuyers.length > 0 ? Math.round(selectedBuyerLtv / selectedBuyers.length) : null,
    };
  }, [dateRange.from, dateRange.to, selectedBuyerKeys.size, selectedBuyers, selectedItems]);

  const monthlyRows = useMemo(() => {
    const firstPaymentByBuyer = new Map(
      buyers.map((buyer) => [buyer.customerKey, buyer.firstPaymentDate]),
    );
    const map = new Map(
      monthKeysBetween(dateRange.from, dateRange.to).map((month) => [
        month,
        { month, newRevenue: 0, continuingRevenue: 0, total: 0, payerKeys: new Set<string>() },
      ]),
    );

    for (const item of selectedItems) {
      const row = map.get(item.paymentDate.slice(0, 7));
      if (!row) continue;
      if (firstPaymentByBuyer.get(item.customerKey) === item.paymentDate) {
        row.newRevenue += item.amount;
      } else {
        row.continuingRevenue += item.amount;
      }
      row.total += item.amount;
      row.payerKeys.add(item.customerKey);
    }

    return Array.from(map.values()).map((row) => ({
      month: row.month,
      newRevenue: row.newRevenue,
      continuingRevenue: row.continuingRevenue,
      total: row.total,
      payerCount: row.payerKeys.size,
    }));
  }, [buyers, dateRange.from, dateRange.to, selectedItems]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            ANALYCA売上
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(metrics.revenue)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            期間内支払者
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            {numberFormatter.format(metrics.payerCount)}人
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            期間内新規有料者
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            {numberFormatter.format(metrics.newBuyerCount)}人
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            平均ANALYCA LTV
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            {metrics.averageLtv === null ? '—' : `¥${numberFormatter.format(metrics.averageLtv)}`}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            期間内支払者のANALYCA累計売上
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          月別 ANALYCA売上
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          初回決済と継続決済を分けて表示
        </p>
        <div className="mt-4 h-80">
          <ResponsiveContainer>
            <ComposedChart data={monthlyRows} margin={{ top: 10, right: 35, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="amount"
                tick={{ fontSize: 12, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
              />
              <YAxis yAxisId="people" orientation="right" hide />
              <Tooltip
                formatter={(value, name) => [
                  name === '支払者数'
                    ? `${numberFormatter.format(Number(value ?? 0))}人`
                    : `¥${numberFormatter.format(Number(value ?? 0))}`,
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="amount" dataKey="newRevenue" name="新規売上" stackId="sales" fill="#f59e0b" />
              <Bar yAxisId="amount" dataKey="continuingRevenue" name="継続売上" stackId="sales" fill="#8b5cf6" />
              <Line yAxisId="people" dataKey="payerCount" name="支払者数" stroke="#0f172a" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          ANALYCA購入者
        </h2>
        {selectedBuyers.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <thead className="bg-[color:var(--color-surface-muted)] text-xs uppercase text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">購入者</th>
                  <th className="px-3 py-2 text-right">ANALYCA累計LTV</th>
                  <th className="px-3 py-2 text-right">決済回数</th>
                  <th className="px-3 py-2 text-left">初回決済日</th>
                  <th className="px-3 py-2 text-left">直近決済日</th>
                </tr>
              </thead>
              <tbody>
                {selectedBuyers.map((buyer) => (
                  <tr key={buyer.customerKey} className="border-t border-[color:var(--color-border)]">
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-[color:var(--color-text-primary)]">
                      {buyer.customerName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                      ¥{numberFormatter.format(buyer.ltv)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                      {numberFormatter.format(buyer.purchaseCount)}回
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(buyer.firstPaymentDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(buyer.lastPaymentDate)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] p-8 text-center text-sm text-[color:var(--color-text-muted)]">
            選択期間にANALYCAの決済がありません
          </div>
        )}
      </Card>
    </>
  );
}
