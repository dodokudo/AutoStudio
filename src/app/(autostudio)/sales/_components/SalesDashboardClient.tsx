'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
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
  { id: 'corporate', label: '法人案件', color: '#ec4899' },
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

interface TransactionGroup {
  id: string;
  name: string;
  items: Array<{ itemType: 'charge' | 'manual'; itemId: string }>;
}

interface LineDailyRegistration {
  date: string;
  registrations: number;
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
    groups?: TransactionGroup[];
    lineDailyRegistrations?: LineDailyRegistration[];
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

  // グループ化機能
  const [groups, setGroups] = useState<TransactionGroup[]>(initialData.groups ?? []);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isGrouping, setIsGrouping] = useState(false);

  // 顧客名編集機能
  const [editingCustomerName, setEditingCustomerName] = useState<string | null>(null);
  const [editCustomerNameValue, setEditCustomerNameValue] = useState('');

  // 期間変更時に初期データを同期
  useEffect(() => {
    setCategories(initialData.categories as Record<string, SalesCategoryId>);
    setManualSales(initialData.manualSales);
    setGroups(initialData.groups ?? []);
    setSelectedItems(new Set());
    setEditingCustomerName(null);
  }, [initialData.categories, initialData.manualSales, initialData.groups, initialData.dateRange.from, initialData.dateRange.to]);

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

  // 顧客名を更新
  const handleUpdateCustomerName = useCallback(async (id: string, customerName: string) => {
    try {
      await fetch('/api/sales/manual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, customerName }),
      });
      setManualSales(prev => prev.map(s => s.id === id ? { ...s, customerName } : s));
      setEditingCustomerName(null);
    } catch (error) {
      console.error('Failed to update customer name:', error);
    }
  }, []);

  // グループ化
  const handleCreateGroup = useCallback(async () => {
    if (selectedItems.size < 2) return;

    setIsGrouping(true);
    try {
      const items = Array.from(selectedItems).map(key => {
        const [type, id] = key.split(':');
        return { type: type as 'charge' | 'manual', id };
      });

      const res = await fetch('/api/sales/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', items }),
      });

      if (res.ok) {
        const { id } = await res.json();
        setGroups(prev => [...prev, {
          id,
          name: '',
          items: items.map(i => ({ itemType: i.type, itemId: i.id })),
        }]);
        setSelectedItems(new Set());
      }
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsGrouping(false);
    }
  }, [selectedItems]);

  // グループ解除
  const handleDeleteGroup = useCallback(async (groupId: string) => {
    try {
      await fetch(`/api/sales/groups?id=${groupId}`, { method: 'DELETE' });
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  }, []);

  // アイテムの選択/解除をトグル
  const toggleItemSelection = useCallback((source: 'univapay' | 'manual', id: string) => {
    const itemType = source === 'univapay' ? 'charge' : 'manual';
    const key = `${itemType}:${id}`;
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  // アイテムがグループに属しているかチェック
  const getGroupForItem = useCallback((source: 'univapay' | 'manual', id: string): TransactionGroup | null => {
    const itemType = source === 'univapay' ? 'charge' : 'manual';
    return groups.find(g => g.items.some(i => i.itemType === itemType && i.itemId === id)) ?? null;
  }, [groups]);

  const successfulCharges = charges.filter((c) => c.status === 'successful');

  const lineRegistrationsInRange = useMemo(() => {
    if (!initialData.lineDailyRegistrations || initialData.lineDailyRegistrations.length === 0) {
      return null;
    }
    const startDate = new Date(dateRange.from + 'T00:00:00');
    const endDate = new Date(dateRange.to + 'T00:00:00');
    return initialData.lineDailyRegistrations
      .filter((item) => {
        const target = new Date(item.date + 'T00:00:00');
        return target >= startDate && target <= endDate;
      })
      .reduce((sum, item) => sum + item.registrations, 0);
  }, [dateRange.from, dateRange.to, initialData.lineDailyRegistrations]);

  // 期間内の手動売上をフィルタリング
  const filteredManualSales = useMemo(() => {
    // dateRangeはYYYY-MM-DD形式のローカル日付文字列
    return manualSales.filter(sale => {
      return sale.transactionDate >= dateRange.from && sale.transactionDate <= dateRange.to;
    });
  }, [manualSales, dateRange]);

  // 日別売上データを集計（期間内の全日付を含む）
  const dailySales = useMemo(() => {
    const dailyMap = new Map<string, { date: string; amount: number; count: number }>();

    // ローカルタイムゾーンでYYYY-MM-DD形式に変換
    const toLocalDateStr = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // 期間内の全日付を初期化（ローカル時間として解釈）
    const startDate = new Date(dateRange.from + 'T00:00:00');
    const endDate = new Date(dateRange.to + 'T00:00:00');
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateStr(d);
      dailyMap.set(dateStr, { date: dateStr, amount: 0, count: 0 });
    }

    // UnivaPay売上データを集計
    for (const charge of charges) {
      if (charge.status !== 'successful') continue;

      const chargeDate = new Date(charge.created_on);
      const date = toLocalDateStr(chargeDate);
      const existing = dailyMap.get(date);

      if (existing) {
        existing.amount += charge.charged_amount;
        existing.count += 1;
      }
    }

    // 手動売上を追加（期間内のみ）
    for (const sale of filteredManualSales) {
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
  }, [charges, filteredManualSales, dateRange, shortDateFormatter]);

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

    // 手動売上を追加（期間内のみ）
    for (const sale of filteredManualSales) {
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
  }, [successfulCharges, filteredManualSales, categories]);

  const frontendPurchaseCount = useMemo(() => {
    return allTransactions.filter(tx => tx.category === 'frontend').length;
  }, [allTransactions]);

  // グループ化を考慮した表示用取引一覧
  type DisplayTransaction = {
    id: string;
    groupId?: string;
    date: Date;
    amount: number;
    category: SalesCategoryId | null;
    customerName: string;
    paymentMethods: string[];
    isGrouped: boolean;
    items: UnifiedTransaction[];
    source: 'univapay' | 'manual' | 'grouped';
  };

  const displayTransactions = useMemo(() => {
    const result: DisplayTransaction[] = [];
    const processedIds = new Set<string>();

    for (const tx of allTransactions) {
      if (processedIds.has(tx.id)) continue;

      // このアイテムが属するグループを探す
      const itemType = tx.source === 'univapay' ? 'charge' : 'manual';
      const group = groups.find(g => g.items.some(i => i.itemType === itemType && i.itemId === tx.id));

      if (group) {
        // グループ化されている場合、グループ内の全アイテムをまとめる
        const groupItems: UnifiedTransaction[] = [];
        for (const item of group.items) {
          const found = allTransactions.find(t => {
            const tType = t.source === 'univapay' ? 'charge' : 'manual';
            return tType === item.itemType && t.id === item.itemId;
          });
          if (found) {
            groupItems.push(found);
            processedIds.add(found.id);
          }
        }

        if (groupItems.length > 0) {
          const totalAmount = groupItems.reduce((sum, i) => sum + i.amount, 0);
          const latestDate = new Date(Math.max(...groupItems.map(i => i.date.getTime())));
          const paymentMethods = [...new Set(groupItems.map(i => i.paymentMethod))];
          const customerName = groupItems[0].customerName;
          const category = groupItems.find(i => i.category)?.category ?? null;

          result.push({
            id: group.id,
            groupId: group.id,
            date: latestDate,
            amount: totalAmount,
            category,
            customerName,
            paymentMethods,
            isGrouped: true,
            items: groupItems,
            source: 'grouped',
          });
        }
      } else {
        // グループ化されていない場合はそのまま
        processedIds.add(tx.id);
        result.push({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          category: tx.category,
          customerName: tx.customerName,
          paymentMethods: [tx.paymentMethod],
          isGrouped: false,
          items: [tx],
          source: tx.source,
        });
      }
    }

    return result.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allTransactions, groups]);

  // グループ化を考慮した集計値
  const groupedStats = useMemo(() => {
    let totalAmount = 0;
    let totalCount = 0;

    for (const tx of displayTransactions) {
      totalAmount += tx.amount;
      totalCount += 1;
    }

    return {
      totalAmount,
      totalCount,
      averageAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
    };
  }, [displayTransactions]);

  const lineToFrontendRate = useMemo(() => {
    if (lineRegistrationsInRange === null || lineRegistrationsInRange === 0) return null;
    return (frontendPurchaseCount / lineRegistrationsInRange) * 100;
  }, [frontendPurchaseCount, lineRegistrationsInRange]);

  const mainCategoryStats = useMemo(() => {
    const stats: Record<SalesCategoryId, { amount: number; count: number }> = {
      frontend: { amount: 0, count: 0 },
      backend: { amount: 0, count: 0 },
      backend_renewal: { amount: 0, count: 0 },
      analyca: { amount: 0, count: 0 },
      corporate: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };

    for (const tx of displayTransactions) {
      const category = tx.category ?? 'other';
      stats[category].amount += tx.amount;
      stats[category].count += 1;
    }

    return stats;
  }, [displayTransactions]);

  // カテゴリ別売上を集計（グループ化考慮）
  const categoryStatsGrouped = useMemo(() => {
    const stats: Record<SalesCategoryId, { amount: number; count: number }> = {
      frontend: { amount: 0, count: 0 },
      backend: { amount: 0, count: 0 },
      backend_renewal: { amount: 0, count: 0 },
      analyca: { amount: 0, count: 0 },
      corporate: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };

    for (const tx of displayTransactions) {
      const category = tx.category ?? 'other';
      stats[category].amount += tx.amount;
      stats[category].count += 1;
    }

    return SALES_CATEGORIES.map(cat => ({
      ...cat,
      ...stats[cat.id],
    })).filter(cat => cat.amount > 0);
  }, [displayTransactions]);

  // 平均単価を計算（グループ化考慮）
  const averageAmount = groupedStats.averageAmount;

  // 入金日を計算するヘルパー関数
  const getPaymentDate = (saleDate: Date): Date => {
    const year = saleDate.getFullYear();
    const month = saleDate.getMonth();
    const day = saleDate.getDate();

    let paymentDate: Date;

    if (day <= 15) {
      // 1日〜15日の売上 → 同月末
      paymentDate = new Date(year, month + 1, 0); // 月末
    } else {
      // 16日〜月末の売上 → 翌月15日
      paymentDate = new Date(year, month + 1, 15);
    }

    // 土日の場合は翌営業日（月曜日）に調整
    const dayOfWeek = paymentDate.getDay();
    if (dayOfWeek === 0) {
      // 日曜日 → 月曜日
      paymentDate.setDate(paymentDate.getDate() + 1);
    } else if (dayOfWeek === 6) {
      // 土曜日 → 月曜日
      paymentDate.setDate(paymentDate.getDate() + 2);
    }

    return paymentDate;
  };

  // 入金済み・入金予定を計算
  const paymentStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ローカル日付をYYYY-MM-DD形式で取得
    const toLocalDateStr = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    let deposited = 0; // 入金済み
    let pending = 0; // 入金予定
    const pendingByDate = new Map<string, number>(); // 入金予定日別

    for (const tx of displayTransactions) {
      // 支払方法を判定
      const hasCard = tx.paymentMethods.includes('クレジットカード');
      const hasBankTransfer = tx.paymentMethods.some(m => m !== 'クレジットカード');

      if (tx.isGrouped) {
        // グループ化された取引は内訳で計算
        for (const item of tx.items) {
          if (item.source === 'manual') {
            // 銀行振込は入金済み
            deposited += item.amount;
          } else {
            // カード決済は入金日で判定
            const paymentDate = getPaymentDate(item.date);
            if (paymentDate <= today) {
              deposited += item.amount;
            } else {
              pending += item.amount;
              const dateKey = toLocalDateStr(paymentDate);
              pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + item.amount);
            }
          }
        }
      } else {
        if (hasBankTransfer && !hasCard) {
          // 銀行振込のみ → 入金済み
          deposited += tx.amount;
        } else if (hasCard) {
          // カード決済 → 入金日で判定
          const paymentDate = getPaymentDate(tx.date);
          if (paymentDate <= today) {
            deposited += tx.amount;
          } else {
            pending += tx.amount;
            const dateKey = toLocalDateStr(paymentDate);
            pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + tx.amount);
          }
        }
      }
    }

    // 入金予定日別にソート
    const pendingSchedule = Array.from(pendingByDate.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { deposited, pending, pendingSchedule };
  }, [displayTransactions]);

  return (
    <>
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            売上合計
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(groupedStats.totalAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            取引件数
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {numberFormatter.format(groupedStats.totalCount)}件
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
            入金済み
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ¥{numberFormatter.format(paymentStats.deposited)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            銀行振込 + 入金済カード
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            入金予定
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            ¥{numberFormatter.format(paymentStats.pending)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            カード決済（未入金）
          </p>
        </Card>
        <Card className="p-4 col-span-2 md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            入金予定スケジュール
          </p>
          <div className="mt-2 space-y-1">
            {paymentStats.pendingSchedule.length > 0 ? (
              paymentStats.pendingSchedule.map(({ date, amount }) => {
                // YYYY-MM-DD形式をローカル日付としてパース
                const [y, m, d] = date.split('-').map(Number);
                const localDate = new Date(y, m - 1, d);
                return (
                <div key={date} className="flex justify-between text-sm">
                  <span className="text-[color:var(--color-text-secondary)]">
                    {localDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="font-medium text-[color:var(--color-text-primary)]">
                    ¥{numberFormatter.format(amount)}
                  </span>
                </div>
                );
              })
            ) : (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                入金予定なし
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* フロント転換率 */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
          LINE登録 → フロント購入率
        </p>
        <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
          {lineToFrontendRate !== null ? `${lineToFrontendRate.toFixed(1)}%` : '—'}
        </p>
        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
          LINE登録 {lineRegistrationsInRange !== null ? numberFormatter.format(lineRegistrationsInRange) : '—'}人 /
          フロント購入 {numberFormatter.format(frontendPurchaseCount)}件
        </p>
      </Card>

      {/* 主要カテゴリ売上 */}
      <div className="grid gap-4 md:grid-cols-4">
        {(['frontend', 'backend', 'backend_renewal', 'analyca'] as const).map((id) => {
          const category = SALES_CATEGORIES.find(c => c.id === id);
          if (!category) return null;
          const stats = mainCategoryStats[id];
          return (
            <Card key={id} className="p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  {category.label}
                </p>
              </div>
              <p className="mt-2 text-2xl font-bold text-[color:var(--color-text-primary)]">
                ¥{numberFormatter.format(stats.amount)}
              </p>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                {numberFormatter.format(stats.count)}件
              </p>
            </Card>
          );
        })}
      </div>

      {/* カテゴリ別売上 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            カテゴリ別売上
          </h2>
          <div className="mt-4 h-64">
            {categoryStatsGrouped.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryStatsGrouped}
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
                    {categoryStatsGrouped.map((entry) => (
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
            {categoryStatsGrouped.length > 0 ? (
              categoryStatsGrouped.map(cat => (
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              取引一覧
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              期間内の全取引（UnivaPay + 手動入力）を日付順に表示
            </p>
          </div>
          {selectedItems.size >= 2 && (
            <button
              onClick={handleCreateGroup}
              disabled={isGrouping}
              className="rounded-[var(--radius-md)] bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isGrouping ? 'グループ化中...' : `${selectedItems.size}件をグループ化`}
            </button>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          {displayTransactions.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">顧客名</th>
                  <th className="px-3 py-2">カテゴリ</th>
                  <th className="px-3 py-2">支払方法</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {displayTransactions.map((tx) => {
                  const isEditing = editingCustomerName === tx.id;
                  const manualItem = tx.items.find(i => i.source === 'manual');
                  const chargeItem = tx.items.find(i => i.source === 'univapay');

                  // 未グループ化アイテムの選択状態
                  const itemType = tx.source === 'univapay' ? 'charge' : tx.source === 'manual' ? 'manual' : null;
                  const isSelected = itemType ? selectedItems.has(`${itemType}:${tx.id}`) : false;

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-[color:var(--color-surface-muted)] ${
                        tx.isGrouped ? 'bg-purple-50' : ''
                      } ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-3 py-2">
                        {!tx.isGrouped && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (tx.source !== 'grouped') {
                                toggleItemSelection(tx.source, tx.id);
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        )}
                        {tx.isGrouped && (
                          <span className="text-purple-600 text-xs" title="グループ化済み">●</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                        {dateFormatter.format(tx.date)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[color:var(--color-text-primary)]">
                        ¥{numberFormatter.format(tx.amount)}
                      </td>
                      <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                        {isEditing && manualItem ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editCustomerNameValue}
                              onChange={(e) => setEditCustomerNameValue(e.target.value)}
                              className="w-24 rounded border px-1 py-0.5 text-sm"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdateCustomerName(manualItem.id, editCustomerNameValue)}
                              className="text-green-600 text-xs"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingCustomerName(null)}
                              className="text-gray-500 text-xs"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <span>{tx.customerName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {chargeItem && !tx.isGrouped ? (
                          <select
                            value={tx.category ?? ''}
                            onChange={(e) => handleCategoryChange(chargeItem.id, e.target.value as SalesCategoryId)}
                            disabled={savingCategory === chargeItem.id}
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
                        <div className="flex flex-wrap gap-1">
                          {tx.paymentMethods.map((method, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                method === 'クレジットカード'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {method}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {manualItem && !tx.isGrouped && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingCustomerName(tx.id);
                                  setEditCustomerNameValue(tx.customerName);
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDeleteManualSale(manualItem.id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                削除
                              </button>
                            </>
                          )}
                          {tx.isGrouped && tx.groupId && (
                            <>
                              {manualItem && (
                                <button
                                  onClick={() => {
                                    setEditingCustomerName(tx.id);
                                    setEditCustomerNameValue(tx.customerName);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs"
                                >
                                  編集
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteGroup(tx.groupId!)}
                                className="text-purple-600 hover:text-purple-800 text-xs"
                              >
                                解除
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
