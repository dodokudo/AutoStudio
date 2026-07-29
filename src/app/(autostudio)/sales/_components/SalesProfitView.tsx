'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  EXPENSE_BUSINESS_UNITS,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  type ExpenseBusinessUnitId,
  type ExpenseCategoryId,
  type ExpenseTypeId,
  type SalesExpense,
} from '@/lib/sales/expenseTypes';

export interface ProfitRevenueItem {
  id: string;
  amount: number;
  category: string;
  paymentDate: string;
}

interface SalesProfitViewProps {
  revenueItems: ProfitRevenueItem[];
  dateRange: {
    from: string;
    to: string;
  };
}

const COURSE_CATEGORIES = new Set([
  'frontend',
  'backend',
  'backend_performance',
  'backend_renewal',
]);

const todayInJapan = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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

export function SalesProfitView({ revenueItems, dateRange }: SalesProfitViewProps) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);
  const [expenses, setExpenses] = useState<SalesExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(dateRange.to.slice(0, 7));
  const [form, setForm] = useState({
    amount: '',
    category: 'class_cost' as ExpenseCategoryId,
    expenseType: 'direct' as ExpenseTypeId,
    businessUnit: 'course' as ExpenseBusinessUnitId,
    description: '',
    expenseDate: todayInJapan(),
  });

  useEffect(() => {
    let canceled = false;
    const loadExpenses = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const response = await fetch(
          `/api/sales/expenses?start=${dateRange.from}&end=${dateRange.to}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('費用データを取得できませんでした');
        const payload = await response.json();
        if (!canceled) setExpenses(payload.expenses ?? []);
      } catch (error) {
        if (!canceled) {
          setErrorMessage(error instanceof Error ? error.message : '費用データを取得できませんでした');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    loadExpenses();
    return () => {
      canceled = true;
    };
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    setSelectedMonth(dateRange.to.slice(0, 7));
    setShowAllExpenses(false);
  }, [dateRange.to]);

  const handleAddExpense = useCallback(async () => {
    if (!form.amount || !form.expenseDate) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/sales/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      if (!response.ok) throw new Error('費用を保存できませんでした');
      const payload = await response.json();
      setExpenses((current) => [payload.expense, ...current]);
      setForm((current) => ({ ...current, amount: '', description: '' }));
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '費用を保存できませんでした');
    } finally {
      setSubmitting(false);
    }
  }, [form]);

  const handleDeleteExpense = useCallback(async (id: string) => {
    if (!window.confirm('この費用を削除しますか？削除履歴は台帳に残ります。')) return;
    setErrorMessage('');
    try {
      const response = await fetch(`/api/sales/expenses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('費用を削除できませんでした');
      setExpenses((current) => current.filter((expense) => expense.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '費用を削除できませんでした');
    }
  }, []);

  const metrics = useMemo(() => {
    const revenue = revenueItems.reduce((sum, item) => sum + item.amount, 0);
    const courseRevenue = revenueItems.reduce(
      (sum, item) => sum + (COURSE_CATEGORIES.has(item.category) ? item.amount : 0),
      0,
    );
    const analycaRevenue = revenueItems.reduce(
      (sum, item) => sum + (item.category === 'analyca' ? item.amount : 0),
      0,
    );
    const directCosts = expenses.reduce(
      (sum, expense) => sum + (expense.expenseType === 'direct' ? expense.amount : 0),
      0,
    );
    const operatingCosts = expenses.reduce(
      (sum, expense) => sum + (expense.expenseType === 'operating' ? expense.amount : 0),
      0,
    );
    const grossProfit = revenue - directCosts;
    const operatingProfit = grossProfit - operatingCosts;
    const moneyForwardCosts = expenses.reduce(
      (sum, expense) => sum + (expense.source === 'moneyforward' ? expense.amount : 0),
      0,
    );
    const manualCosts = expenses.reduce(
      (sum, expense) => sum + (expense.source === 'manual' ? expense.amount : 0),
      0,
    );
    return {
      revenue,
      courseRevenue,
      analycaRevenue,
      otherRevenue: revenue - courseRevenue - analycaRevenue,
      directCosts,
      operatingCosts,
      grossProfit,
      operatingProfit,
      moneyForwardCosts,
      manualCosts,
      margin: revenue > 0 ? (operatingProfit / revenue) * 100 : null,
    };
  }, [expenses, revenueItems]);

  const monthlyRows = useMemo(() => {
    const map = new Map(
      monthKeysBetween(dateRange.from, dateRange.to).map((month) => [
        month,
        { month, revenue: 0, expenses: 0, profit: 0 },
      ]),
    );
    for (const item of revenueItems) {
      const row = map.get(item.paymentDate.slice(0, 7));
      if (row) row.revenue += item.amount;
    }
    for (const expense of expenses) {
      const row = map.get(expense.expenseDate.slice(0, 7));
      if (row) row.expenses += expense.amount;
    }
    return Array.from(map.values()).map((row) => ({
      ...row,
      profit: row.revenue - row.expenses,
    }));
  }, [dateRange.from, dateRange.to, expenses, revenueItems]);

  const categoryLabel = (id: ExpenseCategoryId) =>
    EXPENSE_CATEGORIES.find((item) => item.id === id)?.label ?? id;
  const typeLabel = (id: ExpenseTypeId) =>
    EXPENSE_TYPES.find((item) => item.id === id)?.label ?? id;
  const businessUnitLabel = (id: ExpenseBusinessUnitId) =>
    EXPENSE_BUSINESS_UNITS.find((item) => item.id === id)?.label ?? id;
  const selectedMonthRow = monthlyRows.find((row) => row.month === selectedMonth) ?? {
    month: selectedMonth,
    revenue: 0,
    expenses: 0,
    profit: 0,
  };
  const selectedMonthExpenses = expenses.filter(
    (expense) => expense.expenseDate.slice(0, 7) === selectedMonth,
  );
  const visibleExpenses = showAllExpenses
    ? selectedMonthExpenses
    : selectedMonthExpenses.slice(0, 100);
  const selectedMonthCategories = Array.from(
    selectedMonthExpenses.reduce((map, expense) => {
      const name = expense.sourceCategory || categoryLabel(expense.category);
      const current = map.get(name) ?? {
        name,
        group: expense.sourceGroup ?? (expense.source === 'manual' ? '手入力' : ''),
        color: expense.sourceColor ?? '#64748b',
        amount: 0,
        count: 0,
      };
      current.amount += expense.amount;
      current.count += 1;
      map.set(name, current);
      return map;
    }, new Map<string, {
      name: string;
      group: string;
      color: string;
      amount: number;
      count: number;
    }>()),
  )
    .map(([, category]) => category)
    .sort((a, b) => b.amount - a.amount);
  const selectedMonthMargin =
    selectedMonthRow.revenue > 0
      ? (selectedMonthRow.profit / selectedMonthRow.revenue) * 100
      : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">売上</p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(metrics.revenue)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            講座 ¥{numberFormatter.format(metrics.courseRevenue)}・ANALYCA ¥{numberFormatter.format(metrics.analycaRevenue)}・その他 ¥{numberFormatter.format(metrics.otherRevenue)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">費用合計</p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(metrics.directCosts + metrics.operatingCosts)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            MoneyForward ¥{numberFormatter.format(metrics.moneyForwardCosts)}・手入力 ¥{numberFormatter.format(metrics.manualCosts)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">粗利益</p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(metrics.grossProfit)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">売上 − 直接原価</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">営業利益</p>
          <p className={`mt-1 text-2xl font-bold ${
            metrics.operatingProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
          }`}>
            ¥{numberFormatter.format(metrics.operatingProfit)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            利益率 {metrics.margin === null ? '—' : `${metrics.margin.toFixed(1)}%`}
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          月次 売上・費用・利益
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          決済日と費用発生日を基準に集計
        </p>
        <div className="mt-4 h-80">
          <ResponsiveContainer>
            <ComposedChart data={monthlyRows} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
              />
              <Tooltip formatter={(value, name) => [`¥${numberFormatter.format(Number(value ?? 0))}`, String(name)]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="売上" fill="#3b82f6" />
              <Bar dataKey="expenses" name="費用" fill="#f59e0b" />
              <Line dataKey="profit" name="営業利益" stroke="#10b981" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">費用台帳</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              MoneyForwardの「事業」と「個人／家賃」だけを自動反映。その他の個人支出・未分類は除外
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {showForm ? '閉じる' : '+ 未登録費用を追加'}
          </button>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {showForm ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              費用発生日
              <input
                type="date"
                value={form.expenseDate}
                onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              金額
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
                placeholder="例: 50000"
              />
            </label>
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              費目
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as ExpenseCategoryId }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
              >
                {EXPENSE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              利益区分
              <select
                value={form.expenseType}
                onChange={(event) => setForm((current) => ({ ...current, expenseType: event.target.value as ExpenseTypeId }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
              >
                {EXPENSE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              対象
              <select
                value={form.businessUnit}
                onChange={(event) => setForm((current) => ({ ...current, businessUnit: event.target.value as ExpenseBusinessUnitId }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
              >
                {EXPENSE_BUSINESS_UNITS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-text-secondary)]">
              内容
              <input
                type="text"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm"
                placeholder="例: 7月講師費"
              />
            </label>
            <div className="xl:col-span-6 flex justify-end">
              <button
                type="button"
                onClick={handleAddExpense}
                disabled={submitting || !form.amount || !form.expenseDate}
                className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 border-t border-[color:var(--color-border)] pt-4">
          <p className="mb-2 text-xs font-medium text-[color:var(--color-text-muted)]">
            台帳の表示月
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {monthlyRows.map((row) => {
              const isSelected = row.month === selectedMonth;
              return (
                <button
                  key={row.month}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(row.month);
                    setShowAllExpenses(false);
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-[color:var(--color-border)] bg-white text-[color:var(--color-text-secondary)] hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {Number(row.month.slice(5))}月
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">費用データを読み込み中…</p>
        ) : selectedMonthExpenses.length > 0 ? (
          <>
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-[color:var(--color-text-primary)]">
                  {Number(selectedMonth.slice(0, 4))}年{Number(selectedMonth.slice(5))}月の内訳
                </h3>
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  発生日がこの月の明細
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: '売上', value: selectedMonthRow.revenue, color: 'text-blue-700' },
                  { label: '費用', value: selectedMonthRow.expenses, color: 'text-amber-700' },
                  {
                    label: '営業利益',
                    value: selectedMonthRow.profit,
                    color: selectedMonthRow.profit >= 0 ? 'text-emerald-700' : 'text-red-700',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3"
                  >
                    <p className="text-xs text-[color:var(--color-text-muted)]">{item.label}</p>
                    <p className={`mt-1 text-lg font-bold tabular-nums ${item.color}`}>
                      ¥{numberFormatter.format(item.value)}
                    </p>
                  </div>
                ))}
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
                  <p className="text-xs text-[color:var(--color-text-muted)]">利益率</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${
                    selectedMonthRow.profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {selectedMonthMargin === null ? '—' : `${selectedMonthMargin.toFixed(1)}%`}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {selectedMonthCategories.map((category) => (
                  <div
                    key={category.name}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="truncate text-sm font-medium text-[color:var(--color-text-primary)]">
                          {category.name}
                        </span>
                      </div>
                      <p className="mt-0.5 pl-[18px] text-xs text-[color:var(--color-text-muted)]">
                        {category.group}{category.group ? '・' : ''}{category.count}件
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                      ¥{numberFormatter.format(category.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
              <span>
                {numberFormatter.format(visibleExpenses.length)}件を表示
                （全{numberFormatter.format(selectedMonthExpenses.length)}件）
              </span>
              {selectedMonthExpenses.length > 100 ? (
                <button
                  type="button"
                  onClick={() => setShowAllExpenses((current) => !current)}
                  className="font-medium text-[color:var(--color-accent)] hover:underline"
                >
                  {showAllExpenses ? '最新100件に戻す' : '全件表示'}
                </button>
              ) : null}
            </div>
            <div className="mt-2 overflow-x-auto">
              <Table>
              <thead className="bg-[color:var(--color-surface-muted)] text-xs uppercase text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">発生日</th>
                  <th className="px-3 py-2 text-left">データ元</th>
                  <th className="px-3 py-2 text-left">対象</th>
                  <th className="px-3 py-2 text-left">費目</th>
                  <th className="px-3 py-2 text-left">区分</th>
                  <th className="px-3 py-2 text-left">内容</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-[color:var(--color-border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{expense.expenseDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        expense.source === 'moneyforward'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {expense.source === 'moneyforward' ? 'MoneyForward' : '手入力'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{businessUnitLabel(expense.businessUnit)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {expense.sourceCategory || categoryLabel(expense.category)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{typeLabel(expense.expenseType)}</td>
                    <td className="px-3 py-2">{expense.description || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                      ¥{numberFormatter.format(expense.amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {expense.source === 'manual' ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          削除
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--color-text-muted)]">
                          自動
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </Table>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] p-8 text-center text-sm text-[color:var(--color-text-muted)]">
            {Number(selectedMonth.slice(0, 4))}年{Number(selectedMonth.slice(5))}月の対象費用はありません
          </div>
        )}
      </Card>
    </>
  );
}
