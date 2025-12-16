'use client';

import { useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

const SALES_CATEGORIES = [
  { id: 'frontend', label: 'フロントエンド', color: '#3b82f6' },
  { id: 'backend', label: 'バックエンド', color: '#10b981' },
  { id: 'backend_renewal', label: 'バックエンド継続', color: '#8b5cf6' },
  { id: 'analyca', label: 'ANALYCA', color: '#f59e0b' },
  { id: 'other', label: 'その他', color: '#6b7280' },
] as const;

type SalesCategoryId = typeof SALES_CATEGORIES[number]['id'];

interface Charge {
  id: string;
  charged_amount: number;
  charged_currency: string;
  status: string;
  created_on: string;
  metadata?: Record<string, string>;
}

interface ManualSale {
  id: string;
  amount: number;
  category: SalesCategoryId;
  customerName: string;
  paymentMethod: string;
  note: string;
  transactionDate: string;
}

interface SalesDashboardClientProps {
  initialData: {
    summary: {
      totalAmount: number;
      successfulCount: number;
      failedCount: number;
      pendingCount: number;
    };
    charges: Charge[];
    dateRange: {
      from: string;
      to: string;
    };
    categories: Record<string, string>;
    manualSales: ManualSale[];
  };
}

export function SalesDashboardClient({ initialData }: SalesDashboardClientProps) {
  const { summary, charges, dateRange } = initialData;
  const numberFormatter = new Intl.NumberFormat('ja-JP');
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const shortDateFormatter = new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  });

  // カテゴリ管理（初期値をpropsから取得）
  const [categories, setCategories] = useState<Record<string, SalesCategoryId>>(
    initialData.categories as Record<string, SalesCategoryId>
  );
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  // 手動売上（初期値をpropsから取得）
  const [manualSales, setManualSales] = useState<ManualSale[]>(initialData.manualSales);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFormData, setManualFormData] = useState({
    amount: '',
    category: 'frontend' as SalesCategoryId,
    customerName: '',
    paymentMethod: '銀行振込',
    note: '',
    transactionDate: new Date().toISOString().split('T')[0],
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // カテゴリを保存
  const handleCategoryChange = useCallback(async (chargeId: string, category: SalesCategoryId) => {
    setSavingCategory(chargeId);
    setCategories(prev => ({ ...prev, [chargeId]: category }));

    try {
      await fetch('/api/sales/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId, category }),
      });
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setSavingCategory(null);
    }
  }, []);

  // 手動売上を追加
  const handleAddManualSale = useCallback(async () => {
    if (!manualFormData.amount || !manualFormData.transactionDate) return;

    setSubmittingManual(true);
    try {
      const res = await fetch('/api/sales/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(manualFormData.amount),
          category: manualFormData.category,
          customerName: manualFormData.customerName,
          paymentMethod: manualFormData.paymentMethod,
          note: manualFormData.note,
          transactionDate: manualFormData.transactionDate,
        }),
      });

      if (res.ok) {
        const { id } = await res.json();
        setManualSales(prev => [...prev, {
          id,
          amount: Number(manualFormData.amount),
          category: manualFormData.category,
          customerName: manualFormData.customerName,
          paymentMethod: manualFormData.paymentMethod,
          note: manualFormData.note,
          transactionDate: manualFormData.transactionDate,
        }]);
        setManualFormData({
          amount: '',
          category: 'frontend',
          customerName: '',
          paymentMethod: '銀行振込',
          note: '',
          transactionDate: new Date().toISOString().split('T')[0],
        });
        setShowManualForm(false);
      }
    } catch (error) {
      console.error('Failed to add manual sale:', error);
    } finally {
      setSubmittingManual(false);
    }
  }, [manualFormData]);

  // 手動売上を削除
  const handleDeleteManualSale = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sales/manual?id=${id}`, { method: 'DELETE' });
      setManualSales(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to delete manual sale:', error);
    }
  }, []);

  // 日別売上データを集計（期間内の全日付を含む）
  const dailySales = useMemo(() => {
    const dailyMap = new Map<string, { date: string; amount: number; count: number }>();

    // 期間内の全日付を初期化
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyMap.set(dateStr, { date: dateStr, amount: 0, count: 0 });
    }

    // UnivaPay売上データを集計
    for (const charge of charges) {
      if (charge.status !== 'successful') continue;

      const date = charge.created_on.split('T')[0];
      const existing = dailyMap.get(date);

      if (existing) {
        existing.amount += charge.charged_amount;
        existing.count += 1;
      }
    }

    // 手動売上を追加
    for (const sale of manualSales) {
      const existing = dailyMap.get(sale.transactionDate);
      if (existing) {
        existing.amount += sale.amount;
        existing.count += 1;
      }
    }

    return Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        displayDate: shortDateFormatter.format(new Date(item.date)),
      }));
  }, [charges, manualSales, dateRange, shortDateFormatter]);

  // 累計売上を計算
  const cumulativeSales = useMemo(() => {
    let cumulative = 0;
    return dailySales.map((item) => {
      cumulative += item.amount;
      return {
        ...item,
        cumulative,
      };
    });
  }, [dailySales]);

  // カテゴリ別売上を集計
  const categoryStats = useMemo(() => {
    const stats: Record<SalesCategoryId, { amount: number; count: number }> = {
      frontend: { amount: 0, count: 0 },
      backend: { amount: 0, count: 0 },
      backend_renewal: { amount: 0, count: 0 },
      analyca: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };

    // UnivaPayの売上をカテゴリ別に集計
    const successfulCharges = charges.filter(c => c.status === 'successful');
    for (const charge of successfulCharges) {
      const category = categories[charge.id] ?? 'other';
      stats[category].amount += charge.charged_amount;
      stats[category].count += 1;
    }

    // 手動売上を追加
    for (const sale of manualSales) {
      stats[sale.category].amount += sale.amount;
      stats[sale.category].count += 1;
    }

    return SALES_CATEGORIES.map(cat => ({
      ...cat,
      ...stats[cat.id],
    })).filter(cat => cat.amount > 0);
  }, [charges, categories, manualSales]);

  // 合計（手動売上含む）
  const totalWithManual = summary.totalAmount + manualSales.reduce((sum, s) => sum + s.amount, 0);
  const countWithManual = summary.successfulCount + manualSales.length;

  const successfulCharges = charges.filter((c) => c.status === 'successful');

  // 統合取引一覧（UnivaPay + 手動売上）
  type UnifiedTransaction = {
    id: string;
    date: Date;
    amount: number;
    category: SalesCategoryId | null;
    customerName: string;
    source: 'univapay' | 'manual';
    paymentMethod: string;
    note?: string;
  };

  const allTransactions = useMemo(() => {
    const transactions: UnifiedTransaction[] = [];

    // UnivaPay取引を追加
    for (const charge of successfulCharges) {
      transactions.push({
        id: charge.id,
        date: new Date(charge.created_on),
        amount: charge.charged_amount,
        category: categories[charge.id] ?? null,
        customerName: charge.metadata?.['univapay-name'] ?? '-',
        source: 'univapay',
        paymentMethod: 'クレジットカード',
      });
    }

    // 手動売上を追加
    for (const sale of manualSales) {
      transactions.push({
        id: sale.id,
        date: new Date(sale.transactionDate),
        amount: sale.amount,
        category: sale.category,
        customerName: sale.customerName || '-',
        source: 'manual',
        paymentMethod: sale.paymentMethod,
        note: sale.note,
      });
    }

    // 日付の新しい順にソート
    return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [successfulCharges, manualSales, categories]);

  // 平均単価を計算
  const averageAmount = countWithManual > 0
    ? Math.round(totalWithManual / countWithManual)
    : 0;

  return (
    <>
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            売上合計
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(totalWithManual)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            成功件数
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {numberFormatter.format(countWithManual)}件
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            平均単価
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(averageAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            失敗 / 処理中
          </p>
          <p className="mt-1 text-2xl font-bold">
            <span className="text-red-600">{summary.failedCount}</span>
            <span className="text-[color:var(--color-text-muted)]"> / </span>
            <span className="text-amber-600">{summary.pendingCount}</span>
          </p>
        </Card>
      </div>

      {/* カテゴリ別売上 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            カテゴリ別売上
          </h2>
          <div className="mt-4 h-64">
            {categoryStats.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryStats}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props) => {
                      const p = props as unknown as { name: string; percent: number };
                      return `${p.name} ${(p.percent * 100).toFixed(0)}%`;
                    }}
                    labelLine={false}
                  >
                    {categoryStats.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `¥${numberFormatter.format(value)}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[color:var(--color-text-muted)]">
                  カテゴリが設定された取引がありません
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            カテゴリ別内訳
          </h2>
          <div className="mt-4 space-y-3">
            {categoryStats.length > 0 ? (
              categoryStats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm text-[color:var(--color-text-secondary)]">
                      {cat.label}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(cat.amount)}
                    </p>
                    <p className="text-xs text-[color:var(--color-text-muted)]">
                      {cat.count}件
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                取引一覧からカテゴリを設定してください
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* 売上推移グラフ */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          売上推移
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          日別売上（棒グラフ）と累計売上（折れ線）
        </p>
        <div className="mt-4 h-72">
          {cumulativeSales.length > 0 ? (
            <ResponsiveContainer>
              <ComposedChart data={cumulativeSales} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `¥${numberFormatter.format(value)}`,
                    name === 'amount' ? '日別売上' : '累計売上',
                  ]}
                  labelFormatter={(label) => label}
                />
                <Bar
                  yAxisId="left"
                  dataKey="amount"
                  name="日別売上"
                  fill="var(--color-accent)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.8}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  name="累計売上"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                選択した期間に売上データがありません
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 手動売上入力 */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            手動売上入力（銀行振込等）
          </h2>
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {showManualForm ? '閉じる' : '+ 追加'}
          </button>
        </div>

        {showManualForm && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  金額 *
                </label>
                <input
                  type="number"
                  value={manualFormData.amount}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                  placeholder="100000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  カテゴリ *
                </label>
                <select
                  value={manualFormData.category}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, category: e.target.value as SalesCategoryId }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                >
                  {SALES_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  取引日 *
                </label>
                <input
                  type="date"
                  value={manualFormData.transactionDate}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, transactionDate: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  顧客名
                </label>
                <input
                  type="text"
                  value={manualFormData.customerName}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                  placeholder="山田太郎"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  支払方法
                </label>
                <input
                  type="text"
                  value={manualFormData.paymentMethod}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                  placeholder="銀行振込"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
                  備考
                </label>
                <input
                  type="text"
                  value={manualFormData.note}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, note: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm"
                  placeholder="メモ"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleAddManualSale}
                disabled={submittingManual || !manualFormData.amount}
                className="rounded-[var(--radius-md)] bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submittingManual ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

      </Card>

      {/* 全取引一覧 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          取引一覧
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          期間内の全取引（UnivaPay + 手動入力）を日付順に表示
        </p>
        <div className="mt-4 overflow-x-auto">
          {allTransactions.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">顧客名</th>
                  <th className="px-3 py-2">カテゴリ</th>
                  <th className="px-3 py-2">支払方法</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {allTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                      {dateFormatter.format(tx.date)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(tx.amount)}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                      {tx.customerName}
                    </td>
                    <td className="px-3 py-2">
                      {tx.source === 'univapay' ? (
                        <select
                          value={tx.category ?? ''}
                          onChange={(e) => handleCategoryChange(tx.id, e.target.value as SalesCategoryId)}
                          disabled={savingCategory === tx.id}
                          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2 py-1 text-sm disabled:opacity-50"
                        >
                          <option value="">選択...</option>
                          {SALES_CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[color:var(--color-text-secondary)]">
                          {SALES_CATEGORIES.find(c => c.id === tx.category)?.label ?? '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        tx.source === 'univapay'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {tx.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {tx.source === 'manual' && (
                        <button
                          onClick={() => handleDeleteManualSale(tx.id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          削除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
              取引データがありません
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
