'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { AnalycaSalesView } from './AnalycaSalesView';
import { SalesProfitView } from './SalesProfitView';
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
  LineChart,
} from 'recharts';

const SALES_CATEGORIES = [
  { id: 'frontend', label: 'フロントエンド', color: '#3b82f6' },
  { id: 'backend', label: 'バックエンド', color: '#10b981' },
  { id: 'backend_performance', label: 'バックエンド成果報酬', color: '#06b6d4' },
  { id: 'backend_renewal', label: 'バックエンド継続', color: '#8b5cf6' },
  { id: 'analyca', label: 'ANALYCA', color: '#f59e0b' },
  { id: 'corporate', label: '法人案件', color: '#ec4899' },
  { id: 'other', label: 'その他', color: '#6b7280' },
] as const;

const JP_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-13',
  '2025-02-11', '2025-02-23', '2025-02-24',
  '2025-03-20',
  '2025-04-29',
  '2025-05-03', '2025-05-04', '2025-05-05', '2025-05-06',
  '2025-07-21',
  '2025-08-11',
  '2025-09-15', '2025-09-23',
  '2025-10-13',
  '2025-11-03', '2025-11-23', '2025-11-24',
  // 2026
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-12',
  '2026-02-11', '2026-02-23',
  '2026-03-20',
  '2026-04-29',
  '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-07-20',
  '2026-08-11',
  '2026-09-21', '2026-09-23',
  '2026-10-12',
  '2026-11-03', '2026-11-23',
]);

const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toLocalMonthKey = (date: Date) => toLocalDateKey(date).slice(0, 7);

const formatJapanDate = (date: Date) =>
  date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

const addMonthsClamped = (date: Date, months: number) => {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
};

const getSixMonthContractEnd = (lastRenewalDate: Date) =>
  addMonthsClamped(lastRenewalDate, 6);

const isJapaneseHoliday = (date: Date) => JP_HOLIDAYS.has(toLocalDateKey(date));

type SalesCategoryId = typeof SALES_CATEGORIES[number]['id'];
type SalesDashboardView = 'main' | 'courses' | 'frontend' | 'backend' | 'analyca' | 'profit';
type BuyerSort = 'purchase_recent' | 'purchase_oldest' | 'ltv_desc';
type MonthlyMetric = 'amount' | 'count';

interface Charge {
  id: string;
  subscription_id?: string;
  transaction_token_id?: string;
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
  paymentDate?: string | null;
}

interface TransactionGroup {
  id: string;
  name: string;
  items: Array<{ itemType: 'charge' | 'manual'; itemId: string }>;
}

type CustomerStatus = 'contracting' | 'active' | 'paused' | 'cancelled' | 'needs_review';

const CUSTOMER_STATUS_OPTIONS: Array<{ id: CustomerStatus; label: string }> = [
  { id: 'contracting', label: '初回契約中' },
  { id: 'active', label: '継続中' },
  { id: 'paused', label: '休止' },
  { id: 'cancelled', label: '解約' },
  { id: 'needs_review', label: '要確認' },
];

const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, string> = {
  contracting: 'border-blue-300 bg-blue-50 text-blue-700',
  active: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  paused: 'border-amber-300 bg-amber-50 text-amber-700',
  cancelled: 'border-red-300 bg-red-50 text-red-700',
  needs_review: 'border-slate-300 bg-slate-100 text-slate-700',
};

interface CustomerProfile {
  customerKey: string;
  displayName: string;
  status: CustomerStatus;
  courseName: string;
  lineDisplayName: string;
  aliases: string[];
  updatedAt: string;
}

interface AnalycaCustomerIdentity {
  userId: string;
  subscriptionId: string | null;
  transactionTokenId: string | null;
  displayName: string | null;
  lineName: string | null;
  threadsUsername: string | null;
  instagramUsername: string | null;
  email: string | null;
}

interface GroupedPurchase {
  id: string;
  date: Date;
  paymentDate: Date;
  amount: number;
  category: SalesCategoryId;
  customerName: string;
  source: string;
  paymentMethod: string;
  itemCount: number;
}

const normalizeCustomerKey = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\s　]+/g, '')
    .trim();

const CUSTOMER_DISPLAY_NAMES_BY_ALIAS = new Map([
  ['内山章', '内山明'],
  ['内山章：断熱カントク', '内山明'],
  ['マシモ ナギ', '眞下渚'],
  ['マシモ ナギサ', '眞下渚'],
  ['サトウ ヤヨイ', '佐藤弥生'],
].map(([alias, displayName]) => [normalizeCustomerKey(alias), displayName]));

const MERGED_CUSTOMER_DISPLAY_NAMES = new Set(['内山明', '眞下渚', '佐藤弥生']);

const canonicalCustomerName = (value: string) =>
  CUSTOMER_DISPLAY_NAMES_BY_ALIAS.get(normalizeCustomerKey(value)) ?? value;

function buildGroupedPurchases(
  charges: Charge[],
  categories: Record<string, string>,
  manualSales: ManualSale[],
  groups: TransactionGroup[],
): GroupedPurchase[] {
  const rows: Array<GroupedPurchase & { itemType: 'charge' | 'manual' }> = [];

  for (const charge of charges) {
    if (charge.status !== 'successful') continue;
    rows.push({
      id: charge.id,
      date: new Date(charge.created_on),
      paymentDate: new Date(charge.created_on),
      amount: charge.charged_amount,
      category: (categories[charge.id] ?? 'other') as SalesCategoryId,
      customerName: canonicalCustomerName(charge.metadata?.['univapay-name'] ?? '-'),
      source: 'UnivaPay',
      paymentMethod: 'クレジットカード',
      itemCount: 1,
      itemType: 'charge',
    });
  }

  for (const sale of manualSales) {
    rows.push({
      id: sale.id,
      date: new Date(`${sale.transactionDate}T00:00:00`),
      paymentDate: new Date(`${sale.paymentDate ?? sale.transactionDate}T00:00:00`),
      amount: sale.amount,
      category: sale.category ?? 'other',
      customerName: canonicalCustomerName(sale.customerName || '-'),
      source: '手動入力',
      paymentMethod: sale.paymentMethod,
      itemCount: 1,
      itemType: 'manual',
    });
  }

  const rowByKey = new Map(rows.map((row) => [`${row.itemType}:${row.id}`, row]));
  const groupByItemKey = new Map<string, TransactionGroup>();
  for (const group of groups) {
    for (const item of group.items) {
      groupByItemKey.set(`${item.itemType}:${item.itemId}`, group);
    }
  }

  const processed = new Set<string>();
  const result: GroupedPurchase[] = [];

  for (const row of rows) {
    const rowKey = `${row.itemType}:${row.id}`;
    if (processed.has(rowKey)) continue;
    const group = groupByItemKey.get(rowKey);

    if (!group) {
      processed.add(rowKey);
      result.push(row);
      continue;
    }

    const groupRows = group.items
      .map((item) => rowByKey.get(`${item.itemType}:${item.itemId}`))
      .filter((item): item is GroupedPurchase & { itemType: 'charge' | 'manual' } => Boolean(item));

    if (groupRows.length === 0) continue;
    for (const item of groupRows) {
      processed.add(`${item.itemType}:${item.id}`);
    }

    const customerName = canonicalCustomerName(
      group.name.trim() ||
      groupRows.find((item) => item.customerName !== '-')?.customerName ||
      '-',
    );
    const category =
      groupRows.find((item) => item.category !== 'other')?.category ??
      groupRows[0].category;

    result.push({
      id: group.id,
      date: new Date(Math.min(...groupRows.map((item) => item.date.getTime()))),
      paymentDate: new Date(Math.max(...groupRows.map((item) => item.paymentDate.getTime()))),
      amount: groupRows.reduce((sum, item) => sum + item.amount, 0),
      category,
      customerName,
      source: 'グループ',
      paymentMethod: [...new Set(groupRows.map((item) => item.paymentMethod))].join(' + '),
      itemCount: groupRows.length,
    });
  }

  return result.sort((a, b) => b.date.getTime() - a.date.getTime());
}

interface LineDailyRegistration {
  date: string;
  registrations: number;
}

interface SalesDashboardClientProps {
  view?: SalesDashboardView;
  initialData: {
    summary: {
      totalAmount: number;
      successfulCount: number;
      failedCount: number;
      pendingCount: number;
    };
    charges: Charge[];
    cashflowCharges?: Charge[];
    dateRange: {
      from: string;
      to: string;
    };
    categories: Record<string, string>;
    manualSales: ManualSale[];
    groups?: TransactionGroup[];
    customerProfiles?: CustomerProfile[];
    analycaCustomers?: AnalycaCustomerIdentity[];
    lineDailyRegistrations?: LineDailyRegistration[];
    monthlyData?: {
      charges: Charge[];
      categories: Record<string, string>;
      manualSales: ManualSale[];
      groups?: TransactionGroup[];
      rangeStart: string;
      rangeEnd: string;
    };
    customerData?: {
      charges: Charge[];
      categories: Record<string, string>;
      manualSales: ManualSale[];
      groups?: TransactionGroup[];
    };
    deferred?: boolean;
  };
}

export function SalesDashboardClient({ initialData, view = 'main' }: SalesDashboardClientProps) {
  const [fullData, setFullData] = useState<typeof initialData | null>(initialData.deferred ? null : initialData);
  const [summaryState, setSummaryState] = useState(initialData.summary);
  const { dateRange } = initialData;
  const summary = summaryState;
  const charges = fullData?.charges ?? initialData.charges;
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
    (fullData?.categories ?? initialData.categories) as Record<string, SalesCategoryId>
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
    paymentDate: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // グループ化機能
  const [groups, setGroups] = useState<TransactionGroup[]>(initialData.groups ?? []);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isGrouping, setIsGrouping] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>(
    initialData.customerProfiles ?? []
  );
  const [savingCustomerKey, setSavingCustomerKey] = useState<string | null>(null);

  // 顧客名編集機能
  const [editingCustomerName, setEditingCustomerName] = useState<string | null>(null);
  const [editCustomerNameValue, setEditCustomerNameValue] = useState('');

  // 月別売上推移の期間フィルタ
  const [monthlyRangeMonths, setMonthlyRangeMonths] = useState<3 | 6 | 12>(12);
  const [monthlyMetric, setMonthlyMetric] = useState<MonthlyMetric>('amount');
  const [buyerSort, setBuyerSort] = useState<BuyerSort>('purchase_recent');

  // 期間変更時に初期データを同期
  useEffect(() => {
    const source = fullData ?? initialData;
    setCategories(source.categories as Record<string, SalesCategoryId>);
    setManualSales(source.manualSales);
    setGroups(source.groups ?? []);
    setCustomerProfiles(source.customerProfiles ?? []);
    setSelectedItems(new Set());
    setEditingCustomerName(null);
  }, [fullData, initialData]);

  useEffect(() => {
    if (!initialData.deferred) return;
    let canceled = false;

    const loadSummary = async () => {
      try {
        const res = await fetch(
          `/api/sales/summary?start=${dateRange.from}&end=${dateRange.to}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const payload = await res.json();
        if (!canceled && payload?.data) {
          setSummaryState(payload.data);
        }
      } catch {
        // ignore
      }
    };

    const loadFull = async () => {
      try {
        const res = await fetch(
          `/api/sales/dashboard?start=${dateRange.from}&end=${dateRange.to}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const payload = await res.json();
        if (!canceled && payload?.data) {
          setFullData({ ...payload.data, deferred: false });
          setSummaryState(payload.data.summary);
        }
      } catch {
        // ignore
      }
    };

    loadSummary();
    loadFull();

    return () => {
      canceled = true;
    };
  }, [initialData.deferred, dateRange.from, dateRange.to]);

  // カテゴリを保存（UnivaPay charge用）
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

  // カテゴリを保存（manual_sales用）
  const handleManualCategoryChange = useCallback(async (saleId: string, category: SalesCategoryId) => {
    setSavingCategory(saleId);
    setManualSales(prev => prev.map(s => s.id === saleId ? { ...s, category } : s));

    try {
      await fetch('/api/sales/manual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: saleId, category }),
      });
    } catch (error) {
      console.error('Failed to save manual sale category:', error);
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
          paymentDate: manualFormData.paymentDate || undefined,
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
          paymentDate: manualFormData.paymentDate || null,
        }]);
        setManualFormData({
          amount: '',
          category: 'frontend',
          customerName: '',
          paymentMethod: '銀行振込',
          note: '',
          transactionDate: new Date().toISOString().split('T')[0],
          paymentDate: '',
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

  const handleCustomerProfileUpdate = useCallback(async (profile: CustomerProfile) => {
    setSavingCustomerKey(profile.customerKey);
    setCustomerProfiles((current) => {
      const exists = current.some((item) => item.customerKey === profile.customerKey);
      return exists
        ? current.map((item) => item.customerKey === profile.customerKey ? profile : item)
        : [...current, profile];
    });

    try {
      const response = await fetch('/api/sales/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!response.ok) {
        throw new Error('Failed to update customer profile');
      }
    } catch (error) {
      console.error('Failed to update customer profile:', error);
    } finally {
      setSavingCustomerKey(null);
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
    const source = fullData?.lineDailyRegistrations ?? initialData.lineDailyRegistrations;
    if (!source || source.length === 0) {
      return null;
    }
    const startDate = new Date(dateRange.from + 'T00:00:00');
    const endDate = new Date(dateRange.to + 'T00:00:00');
    return source
      .filter((item) => {
        const target = new Date(item.date + 'T00:00:00');
        return target >= startDate && target <= endDate;
      })
      .reduce((sum, item) => sum + item.registrations, 0);
  }, [dateRange.from, dateRange.to, fullData, initialData.lineDailyRegistrations]);

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
    paymentDate?: Date | null;
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
      const paymentDate = sale.paymentDate ? new Date(sale.paymentDate + 'T00:00:00') : null;
      transactions.push({
        id: sale.id,
        date: new Date(sale.transactionDate),
        amount: sale.amount,
        category: sale.category,
        customerName: sale.customerName || '-',
        source: 'manual',
        paymentMethod: sale.paymentMethod,
        note: sale.note,
        paymentDate,
      });
    }

    // 日付の新しい順にソート
    return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [successfulCharges, filteredManualSales, categories]);


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
    paymentDate?: Date;
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
          paymentDate: tx.paymentDate ?? undefined,
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

  const mainCategoryStats = useMemo(() => {
    const stats: Record<SalesCategoryId, { amount: number; count: number }> = {
      frontend: { amount: 0, count: 0 },
      backend: { amount: 0, count: 0 },
      backend_performance: { amount: 0, count: 0 },
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

  const monthlyCounts = useMemo(() => {
    const monthlyData = fullData?.monthlyData ?? initialData.monthlyData;
    if (!monthlyData) return [];
    const { charges: monthlyCharges, categories: monthlyCategories, manualSales: monthlyManual, groups: monthlyGroups, rangeStart, rangeEnd } = monthlyData;
    const start = new Date(rangeStart + 'T00:00:00');
    const end = new Date(rangeEnd + 'T00:00:00');

    const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    const map = new Map<string, { month: string; frontend: number; backend: number }>();

    while (cursor <= last) {
      const key = toMonthKey(cursor);
      map.set(key, { month: key, frontend: 0, backend: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const mergedCategories = { ...(fullData?.categories ?? initialData.categories), ...monthlyCategories } as Record<string, SalesCategoryId>;
    const groupList = monthlyGroups ?? fullData?.groups ?? initialData.groups ?? [];

    const buildMonthlyDisplayTransactions = () => {
      const successfulCharges = monthlyCharges.filter((c) => c.status === 'successful');
      const transactions: Array<{
        id: string;
        date: Date;
        category: SalesCategoryId | null;
        source: 'univapay' | 'manual';
        paymentMethod: string;
      }> = [];

      for (const charge of successfulCharges) {
        transactions.push({
          id: charge.id,
          date: new Date(charge.created_on),
          category: mergedCategories[charge.id] ?? null,
          source: 'univapay',
          paymentMethod: 'クレジットカード',
        });
      }

      for (const sale of monthlyManual) {
        transactions.push({
          id: sale.id,
          date: new Date(sale.transactionDate + 'T00:00:00'),
          category: sale.category ?? null,
          source: 'manual',
          paymentMethod: sale.paymentMethod,
        });
      }

      const result: Array<{
        id: string;
        date: Date;
        category: SalesCategoryId | null;
        source: 'univapay' | 'manual' | 'grouped';
        items?: Array<{
          id: string;
          date: Date;
          category: SalesCategoryId | null;
          source: 'univapay' | 'manual';
        }>;
      }> = [];
      const processed = new Set<string>();

      for (const tx of transactions) {
        const key = `${tx.source}:${tx.id}`;
        if (processed.has(key)) continue;

        const itemType = tx.source === 'univapay' ? 'charge' : 'manual';
        const group = groupList.find(g => g.items.some(i => i.itemType === itemType && i.itemId === tx.id));

        if (group) {
          const groupItems = group.items
            .map((item) => {
              const found = transactions.find(t => {
                const tType = t.source === 'univapay' ? 'charge' : 'manual';
                return tType === item.itemType && t.id === item.itemId;
              });
              return found ?? null;
            })
            .filter(Boolean) as typeof transactions;

          if (groupItems.length > 0) {
            const latestDate = new Date(Math.max(...groupItems.map(i => i.date.getTime())));
            const category = groupItems.find(i => i.category)?.category ?? null;
            result.push({
              id: group.id,
              date: latestDate,
              category,
              source: 'grouped',
              items: groupItems.map(i => ({ ...i })),
            });
            for (const item of groupItems) {
              processed.add(`${item.source}:${item.id}`);
            }
          }
        } else {
          processed.add(key);
          result.push({
            id: tx.id,
            date: tx.date,
            category: tx.category,
            source: tx.source,
          });
        }
      }

      return result;
    };

    const monthlyDisplayTransactions = buildMonthlyDisplayTransactions();

    for (const tx of monthlyDisplayTransactions) {
      const key = toMonthKey(tx.date);
      const entry = map.get(key);
      if (!entry) continue;
      if (tx.category === 'frontend') entry.frontend += 1;
      if (tx.category === 'backend') entry.backend += 1;
    }

    return Array.from(map.values()).map((entry) => ({
      ...entry,
      frontendToBackendRate: entry.frontend > 0 ? (entry.backend / entry.frontend) * 100 : null,
    }));
  }, [fullData, initialData]);

  const monthlySales = useMemo(() => {
    const monthlyData = fullData?.monthlyData ?? initialData.monthlyData;
    if (!monthlyData) return [];
    const { charges, categories: monthlyCategories, manualSales, rangeStart, rangeEnd } = monthlyData;
    const start = new Date(rangeStart + 'T00:00:00');
    const end = new Date(rangeEnd + 'T00:00:00');

    const toMonthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    type MonthEntry = {
      month: string;
      frontend: number;
      backend: number;
      backend_performance: number;
      backend_renewal: number;
      analyca: number;
      corporate: number;
      other: number;
      total: number;
    };
    const map = new Map<string, MonthEntry>();

    while (cursor <= last) {
      const key = toMonthKey(cursor);
      map.set(key, {
        month: key,
        frontend: 0,
        backend: 0,
        backend_performance: 0,
        backend_renewal: 0,
        analyca: 0,
        corporate: 0,
        other: 0,
        total: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const mergedCategories = {
      ...(fullData?.categories ?? initialData.categories),
      ...monthlyCategories,
    } as Record<string, SalesCategoryId>;

    for (const charge of charges) {
      if (charge.status !== 'successful') continue;
      const key = toMonthKey(new Date(charge.created_on));
      const entry = map.get(key);
      if (!entry) continue;
      const cat = (mergedCategories[charge.id] ?? 'other') as SalesCategoryId;
      entry[cat] += charge.charged_amount;
      entry.total += charge.charged_amount;
    }

    for (const sale of manualSales) {
      const key = toMonthKey(new Date(sale.transactionDate + 'T00:00:00'));
      const entry = map.get(key);
      if (!entry) continue;
      const cat = (sale.category ?? 'other') as SalesCategoryId;
      entry[cat] += sale.amount;
      entry.total += sale.amount;
    }

    return Array.from(map.values());
  }, [fullData, initialData]);

  const monthlySalesFiltered = useMemo(() => {
    return monthlySales.slice(-monthlyRangeMonths);
  }, [monthlySales, monthlyRangeMonths]);

  const segmentCategories = useMemo(() => {
    if (view === 'frontend') {
      return SALES_CATEGORIES.filter((category) => category.id === 'frontend');
    }
    if (view === 'backend') {
      return SALES_CATEGORIES.filter((category) =>
        ['backend', 'backend_performance', 'backend_renewal'].includes(category.id)
      );
    }
    if (view === 'courses') {
      return SALES_CATEGORIES.filter((category) =>
        ['frontend', 'backend', 'backend_performance', 'backend_renewal'].includes(category.id)
      );
    }
    return [];
  }, [view]);

  const segmentMonthlySales = useMemo(() => {
    if (view === 'main') return [];
    return monthlySalesFiltered.map((row) => ({
      ...row,
      total: segmentCategories.reduce((sum, category) => sum + row[category.id], 0),
    }));
  }, [monthlySalesFiltered, segmentCategories, view]);

  const monthlyGroupedPurchases = useMemo(() => {
    const monthlyData = fullData?.monthlyData ?? initialData.monthlyData;
    if (!monthlyData) return [];
    return buildGroupedPurchases(
      monthlyData.charges,
      {
        ...(fullData?.categories ?? initialData.categories),
        ...monthlyData.categories,
      },
      monthlyData.manualSales,
      monthlyData.groups ?? fullData?.groups ?? initialData.groups ?? [],
    );
  }, [fullData, initialData]);

  const segmentPurchases = useMemo(() => {
    if (view === 'main') return [];
    const targetCategoryIds = new Set(segmentCategories.map((category) => category.id));
    const visibleMonths = new Set(segmentMonthlySales.map((row) => row.month));
    const toMonthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    return monthlyGroupedPurchases.filter(
      (purchase) =>
        targetCategoryIds.has(purchase.category) &&
        visibleMonths.has(toMonthKey(purchase.date))
    );
  }, [monthlyGroupedPurchases, segmentCategories, segmentMonthlySales, view]);

  const segmentMonthlyCounts = useMemo(() => {
    const rows = segmentMonthlySales.map((row) => {
      const counts = Object.fromEntries(
        segmentCategories.map((category) => [category.id, 0])
      ) as Record<SalesCategoryId, number>;
      return { month: row.month, ...counts, total: 0 };
    });
    const rowByMonth = new Map(rows.map((row) => [row.month, row]));

    for (const purchase of segmentPurchases) {
      const month = toLocalMonthKey(purchase.date);
      const row = rowByMonth.get(month);
      if (!row) continue;
      row[purchase.category] += 1;
      row.total += 1;
    }

    return rows;
  }, [segmentCategories, segmentMonthlySales, segmentPurchases]);

  const monthlyLineRegistrations = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of fullData?.lineDailyRegistrations ?? initialData.lineDailyRegistrations ?? []) {
      const month = row.date.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + row.registrations);
    }
    return totals;
  }, [fullData, initialData.lineDailyRegistrations]);

  const segmentMonthlyChartDataBase = useMemo(() => {
    const baseRows = monthlyMetric === 'count' ? segmentMonthlyCounts : segmentMonthlySales;
    if (view !== 'frontend') return baseRows;

    const countsByMonth = new Map(
      segmentMonthlyCounts.map((row) => [row.month, row.frontend])
    );
    return baseRows.map((row) => {
      const purchaseCount = countsByMonth.get(row.month) ?? 0;
      const lineRegistrations = monthlyLineRegistrations.get(row.month) ?? 0;
      return {
        ...row,
        purchaseCount,
        lineRegistrations,
      };
    });
  }, [
    monthlyLineRegistrations,
    monthlyMetric,
    segmentMonthlyCounts,
    segmentMonthlySales,
    view,
  ]);

  const allTimeCoursePurchases = useMemo(() => {
    const customerData = fullData?.customerData ?? initialData.customerData;
    const rows = customerData
      ? buildGroupedPurchases(
          customerData.charges,
          customerData.categories,
          customerData.manualSales,
          customerData.groups ?? fullData?.groups ?? initialData.groups ?? [],
        )
      : monthlyGroupedPurchases;
    return rows.filter((purchase) =>
      ['frontend', 'backend', 'backend_performance', 'backend_renewal'].includes(purchase.category)
    );
  }, [fullData, initialData, monthlyGroupedPurchases]);

  const allRevenueItems = useMemo(() => {
    const customerData = fullData?.customerData ?? initialData.customerData;
    if (!customerData) return [];

    const aliasToProfile = new Map<string, CustomerProfile>();
    for (const profile of customerProfiles) {
      aliasToProfile.set(normalizeCustomerKey(profile.customerKey), profile);
      aliasToProfile.set(normalizeCustomerKey(profile.displayName), profile);
      for (const alias of profile.aliases) {
        aliasToProfile.set(normalizeCustomerKey(alias), profile);
      }
    }

    const replacedSubscriptionIds = new Map<string, string>();
    for (const charge of customerData.charges) {
      const replacedId = charge.metadata?.replacesSubscriptionId;
      if (charge.subscription_id && replacedId) {
        replacedSubscriptionIds.set(charge.subscription_id, replacedId);
      }
    }
    const resolveSubscriptionId = (subscriptionId: string) => {
      let current = subscriptionId;
      const visited = new Set<string>();
      while (replacedSubscriptionIds.has(current) && !visited.has(current)) {
        visited.add(current);
        current = replacedSubscriptionIds.get(current) as string;
      }
      return current;
    };
    const analycaUserBySubscription = new Map<string, string>();
    for (const charge of customerData.charges) {
      if (charge.subscription_id && charge.metadata?.analycaUserId) {
        analycaUserBySubscription.set(
          resolveSubscriptionId(charge.subscription_id),
          charge.metadata.analycaUserId,
        );
      }
    }
    const analycaCustomers = fullData?.analycaCustomers ?? initialData.analycaCustomers ?? [];
    const identityByUserId = new Map(
      analycaCustomers.map((identity) => [identity.userId, identity]),
    );
    const identityBySubscription = new Map(
      analycaCustomers
        .filter((identity) => identity.subscriptionId)
        .map((identity) => [
          resolveSubscriptionId(identity.subscriptionId as string),
          identity,
        ]),
    );
    const identityByToken = new Map(
      analycaCustomers
        .filter((identity) => identity.transactionTokenId)
        .map((identity) => [identity.transactionTokenId as string, identity]),
    );

    const resolveCustomer = (charge: Charge) => {
      const rawName = charge.metadata?.['univapay-name'] ?? '';
      const canonicalName = canonicalCustomerName(rawName);
      const normalizedName = normalizeCustomerKey(canonicalName);
      const profile = aliasToProfile.get(normalizedName);
      const subscriptionId = charge.subscription_id
        ? resolveSubscriptionId(charge.subscription_id)
        : '';
      const analycaUserId =
        charge.metadata?.analycaUserId ||
        (subscriptionId ? analycaUserBySubscription.get(subscriptionId) : undefined);
      const identity =
        (analycaUserId ? identityByUserId.get(analycaUserId) : undefined) ||
        (subscriptionId ? identityBySubscription.get(subscriptionId) : undefined) ||
        (charge.transaction_token_id
          ? identityByToken.get(charge.transaction_token_id)
          : undefined);
      const identityAliases = identity
        ? [
            identity.displayName,
            identity.lineName,
            identity.threadsUsername,
            identity.instagramUsername,
            identity.email,
          ].filter((value): value is string => Boolean(value))
        : [];
      const identityProfile = identityAliases
        .map((alias) => aliasToProfile.get(normalizeCustomerKey(alias)))
        .find(Boolean);
      const identityHandle = identity?.threadsUsername || identity?.instagramUsername;
      const identityName = identity?.displayName || (identity?.lineName
        ? identityHandle
          ? `${identity.lineName} / @${identityHandle.replace(/^@/, '')}`
          : identity.lineName
        : identityHandle
          ? `@${identityHandle.replace(/^@/, '')}`
          : identity?.email);
      const identityCustomerKey = identity?.displayName
        ? normalizeCustomerKey(identity.displayName)
        : '';
      const fallbackKey =
        identityCustomerKey || (
          identity?.userId ? `analyca:${identity.userId}`
          : analycaUserId ? `analyca:${analycaUserId}`
          : subscriptionId ? `subscription:${subscriptionId}`
            : normalizedName || `token:${charge.transaction_token_id || charge.id}`
        );
      const shortId = (analycaUserId || subscriptionId || charge.id).slice(-4);
      return {
        customerKey: profile?.customerKey ?? identityProfile?.customerKey ?? fallbackKey,
        customerName:
          profile?.displayName ||
          identityProfile?.displayName ||
          identity?.displayName ||
          canonicalName ||
          identityName ||
          `ANALYCA会員 ${shortId}`,
      };
    };

    const chargeRows = customerData.charges
      .filter((charge) => charge.status === 'successful')
      .map((charge) => {
        const customer = resolveCustomer(charge);
        return {
          id: charge.id,
          amount: charge.charged_amount,
          category: (customerData.categories[charge.id] ?? 'other') as SalesCategoryId,
          paymentDate: toLocalDateKey(new Date(charge.created_on)),
          isCardPayment: true,
          ...customer,
        };
      });

    const manualRows = customerData.manualSales.map((sale) => {
      const canonicalName = canonicalCustomerName(sale.customerName);
      const normalizedName = normalizeCustomerKey(canonicalName);
      const profile = aliasToProfile.get(normalizedName);
      const customer = {
        customerKey: profile?.customerKey ?? (normalizedName || `manual:${sale.id}`),
        customerName: profile?.displayName || canonicalName || '購入者名未確認',
      };
      return {
        id: sale.id,
        amount: sale.amount,
        category: sale.category ?? 'other',
        paymentDate: sale.paymentDate || sale.transactionDate,
        isCardPayment: /(クレジット|クレカ|credit|card|univapay)/i.test(sale.paymentMethod),
        ...customer,
      };
    });

    return [...chargeRows, ...manualRows].map((item) => {
      const customerName = canonicalCustomerName(item.customerName);
      if (!MERGED_CUSTOMER_DISPLAY_NAMES.has(customerName)) return item;
      return {
        ...item,
        customerKey: normalizeCustomerKey(customerName),
        customerName,
      };
    });
  }, [
    customerProfiles,
    fullData,
    initialData.analycaCustomers,
    initialData.customerData,
  ]);

  const selectedRangeRevenueItems = useMemo(
    () =>
      allRevenueItems.filter(
        (item) => item.paymentDate >= dateRange.from && item.paymentDate <= dateRange.to
      ),
    [allRevenueItems, dateRange.from, dateRange.to],
  );

  const analycaRevenueItems = useMemo(
    () => allRevenueItems.filter((item) => item.category === 'analyca'),
    [allRevenueItems],
  );

  const buyerSummaries = useMemo(() => {
    const aliasToProfile = new Map<string, CustomerProfile>();
    for (const profile of customerProfiles) {
      aliasToProfile.set(normalizeCustomerKey(profile.customerKey), profile);
      aliasToProfile.set(normalizeCustomerKey(profile.displayName), profile);
      for (const alias of profile.aliases) {
        aliasToProfile.set(normalizeCustomerKey(alias), profile);
      }
    }

    type SummaryAccumulator = {
      customerKey: string;
      displayName: string;
      profile: CustomerProfile | null;
      ltv: number;
      purchaseCount: number;
      frontendAmount: number;
      frontendPurchaseCount: number;
      backendAmount: number;
      backendPurchaseCount: number;
      backendRenewalAmount: number;
      lastPurchaseDate: Date;
      lastPaymentDate: Date;
      firstFrontendDate: Date | null;
      lastRenewalDate: Date | null;
      renewalStartDate: Date | null;
      renewalMonthKeys: Set<string>;
      firstBackendDate: Date | null;
      categories: Set<SalesCategoryId>;
    };
    const map = new Map<string, SummaryAccumulator>();

    for (const purchase of allTimeCoursePurchases) {
      if (!purchase.customerName || purchase.customerName === '-') continue;
      const normalizedName = normalizeCustomerKey(purchase.customerName);
      const matchedProfile = aliasToProfile.get(normalizedName) ?? null;
      const customerKey = matchedProfile?.customerKey ?? normalizedName;
      const existing = map.get(customerKey);
      const isFrontendPurchase = purchase.category === 'frontend';
      const isInitialBackendPurchase = ['backend', 'backend_performance'].includes(purchase.category);
      const isBackendPurchase = isInitialBackendPurchase || purchase.category === 'backend_renewal';

      if (existing) {
        existing.ltv += purchase.amount;
        existing.purchaseCount += 1;
        if (isFrontendPurchase) {
          existing.frontendAmount += purchase.amount;
          existing.frontendPurchaseCount += 1;
        }
        if (isBackendPurchase) {
          existing.backendAmount += purchase.amount;
          existing.backendPurchaseCount += 1;
        }
        if (purchase.category === 'backend_renewal') {
          existing.backendRenewalAmount += purchase.amount;
        }
        existing.categories.add(purchase.category);
        if (purchase.date > existing.lastPurchaseDate) {
          existing.lastPurchaseDate = purchase.date;
        }
        if (purchase.paymentDate > existing.lastPaymentDate) {
          existing.lastPaymentDate = purchase.paymentDate;
        }
        if (
          isFrontendPurchase &&
          (!existing.firstFrontendDate || purchase.date < existing.firstFrontendDate)
        ) {
          existing.firstFrontendDate = purchase.date;
        }
        if (
          purchase.category === 'backend_renewal' &&
          (!existing.lastRenewalDate || purchase.date > existing.lastRenewalDate)
        ) {
          existing.lastRenewalDate = purchase.date;
        }
        if (
          purchase.category === 'backend_renewal' &&
          (!existing.renewalStartDate || purchase.date < existing.renewalStartDate)
        ) {
          existing.renewalStartDate = purchase.date;
        }
        if (purchase.category === 'backend_renewal') {
          existing.renewalMonthKeys.add(toLocalMonthKey(purchase.date));
        }
        if (
          isInitialBackendPurchase &&
          (!existing.firstBackendDate || purchase.date < existing.firstBackendDate)
        ) {
          existing.firstBackendDate = purchase.date;
        }
        continue;
      }

      map.set(customerKey, {
        customerKey,
        displayName: matchedProfile?.displayName || purchase.customerName,
        profile: matchedProfile,
        ltv: purchase.amount,
        purchaseCount: 1,
        frontendAmount: isFrontendPurchase ? purchase.amount : 0,
        frontendPurchaseCount: isFrontendPurchase ? 1 : 0,
        backendAmount: isBackendPurchase ? purchase.amount : 0,
        backendPurchaseCount: isBackendPurchase ? 1 : 0,
        backendRenewalAmount: purchase.category === 'backend_renewal' ? purchase.amount : 0,
        lastPurchaseDate: purchase.date,
        lastPaymentDate: purchase.paymentDate,
        firstFrontendDate: isFrontendPurchase ? purchase.date : null,
        lastRenewalDate: purchase.category === 'backend_renewal' ? purchase.date : null,
        renewalStartDate: purchase.category === 'backend_renewal' ? purchase.date : null,
        renewalMonthKeys: new Set(
          purchase.category === 'backend_renewal' ? [toLocalMonthKey(purchase.date)] : []
        ),
        firstBackendDate: isInitialBackendPurchase ? purchase.date : null,
        categories: new Set([purchase.category]),
      });
    }

    for (const item of analycaRevenueItems) {
      const normalizedName = normalizeCustomerKey(canonicalCustomerName(item.customerName));
      const matchedProfile = aliasToProfile.get(normalizedName) ?? null;
      const customerKey = matchedProfile?.customerKey ?? normalizedName;
      const summary = map.get(customerKey);
      if (!summary) continue;
      summary.categories.add('analyca');
      summary.ltv += item.amount;
      summary.purchaseCount += 1;
      const paymentDate = new Date(`${item.paymentDate}T00:00:00`);
      if (paymentDate > summary.lastPaymentDate) {
        summary.lastPaymentDate = paymentDate;
      }
    }

    const now = new Date();

    return Array.from(map.values()).map((summary) => {
      const hasFrontend = summary.categories.has('frontend');
      const hasInitialBackend =
        summary.categories.has('backend') ||
        summary.categories.has('backend_performance');
      const hasBackend = hasInitialBackend || summary.categories.has('backend_renewal');
      const initialContractEndDate = summary.firstBackendDate
        ? addMonthsClamped(summary.firstBackendDate, 6)
        : null;
      const renewalContractEndDate = summary.lastRenewalDate
        ? getSixMonthContractEnd(summary.lastRenewalDate)
        : null;
      const inferredStatus: CustomerStatus =
        renewalContractEndDate && renewalContractEndDate >= now
          ? 'active'
          : !summary.lastRenewalDate && initialContractEndDate && initialContractEndDate >= now
            ? 'contracting'
            : hasBackend
              ? 'cancelled'
              : 'needs_review';
      const status = summary.profile?.status ?? inferredStatus;
      const nextContractEndDate = renewalContractEndDate ?? initialContractEndDate;

      return {
        ...summary,
        categories: Array.from(summary.categories),
        renewalMonths: summary.renewalMonthKeys.size,
        nextContractEndDate,
        hasFrontend,
        hasInitialBackend,
        hasBackend,
        status,
        courseName: summary.profile?.courseName ?? '',
        lineDisplayName: summary.profile?.lineDisplayName ?? '',
        aliases: summary.profile?.aliases ?? [],
      };
    });
  }, [allTimeCoursePurchases, analycaRevenueItems, customerProfiles]);

  const frontendFirstBuyerCountsByMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const buyer of buyerSummaries) {
      if (!buyer.firstFrontendDate) continue;
      const month = toLocalMonthKey(buyer.firstFrontendDate);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return counts;
  }, [buyerSummaries]);

  const segmentMonthlyChartData = useMemo(() => {
    if (view !== 'frontend') return segmentMonthlyChartDataBase;
    return segmentMonthlyChartDataBase.map((row) => {
      const lineRegistrations = Number(
        'lineRegistrations' in row ? row.lineRegistrations : 0
      );
      const firstBuyerCount = frontendFirstBuyerCountsByMonth.get(row.month) ?? 0;
      return {
        ...row,
        firstBuyerCount,
        frontendCvr:
          lineRegistrations > 0 ? (firstBuyerCount / lineRegistrations) * 100 : null,
      };
    });
  }, [frontendFirstBuyerCountsByMonth, segmentMonthlyChartDataBase, view]);

  const selectedRangeCoursePurchases = useMemo(
    () =>
      allTimeCoursePurchases.filter((purchase) => {
        const purchaseDate = toLocalDateKey(purchase.date);
        return purchaseDate >= dateRange.from && purchaseDate <= dateRange.to;
      }),
    [allTimeCoursePurchases, dateRange.from, dateRange.to]
  );

  const selectedRangeCourseSalesBreakdown = useMemo(
    () =>
      selectedRangeCoursePurchases.reduce(
        (totals, purchase) => {
          if (purchase.category === 'frontend') totals.frontend += purchase.amount;
          if (['backend', 'backend_performance'].includes(purchase.category)) {
            totals.backend += purchase.amount;
          }
          if (purchase.category === 'backend_renewal') totals.renewal += purchase.amount;
          return totals;
        },
        { frontend: 0, backend: 0, renewal: 0 }
      ),
    [selectedRangeCoursePurchases]
  );

  const courseMetrics = useMemo(() => {
    const isDateInRange = (date: Date) => {
      const dateKey = toLocalDateKey(date);
      return dateKey >= dateRange.from && dateKey <= dateRange.to;
    };
    const frontendBuyers = buyerSummaries.filter(
      (buyer) => buyer.firstFrontendDate && isDateInRange(buyer.firstFrontendDate)
    );
    const backendBuyers = buyerSummaries.filter(
      (buyer) => buyer.firstBackendDate && isDateInRange(buyer.firstBackendDate)
    );
    const convertedBuyers = frontendBuyers.filter(
      (buyer) =>
        buyer.firstFrontendDate &&
        buyer.firstBackendDate &&
        isDateInRange(buyer.firstBackendDate) &&
        buyer.firstBackendDate >= buyer.firstFrontendDate
    );
    const frontendBuyerRevenue = frontendBuyers.reduce(
      (sum, buyer) => sum + buyer.ltv,
      0
    );
    const averageLtv = frontendBuyers.length > 0
      ? Math.round(frontendBuyerRevenue / frontendBuyers.length)
      : null;
    const listUnitValue = lineRegistrationsInRange && lineRegistrationsInRange > 0
      ? Math.round(frontendBuyerRevenue / lineRegistrationsInRange)
      : null;

    return {
      frontendBuyerCount: frontendBuyers.length,
      backendBuyerCount: backendBuyers.length,
      frontendCvr: lineRegistrationsInRange && lineRegistrationsInRange > 0
        ? (frontendBuyers.length / lineRegistrationsInRange) * 100
        : null,
      frontendToBackendRate: frontendBuyers.length > 0
        ? (convertedBuyers.length / frontendBuyers.length) * 100
        : null,
      averageLtv,
      listUnitValue,
    };
  }, [
    buyerSummaries,
    dateRange.from,
    dateRange.to,
    lineRegistrationsInRange,
  ]);

  const visibleBuyerSummaries = useMemo(() => {
    return buyerSummaries
      .filter((buyer) => {
        if (view === 'frontend') return buyer.hasFrontend;
        if (view === 'backend') return buyer.hasBackend;
        return true;
      })
      .sort((a, b) => {
        if (buyerSort === 'ltv_desc') {
          return b.ltv - a.ltv;
        }

        const aDate = view === 'frontend'
          ? a.firstFrontendDate
          : view === 'backend'
            ? a.firstBackendDate
            : a.lastPurchaseDate;
        const bDate = view === 'frontend'
          ? b.firstFrontendDate
          : view === 'backend'
            ? b.firstBackendDate
            : b.lastPurchaseDate;
        const missingDate = buyerSort === 'purchase_recent'
          ? Number.MIN_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
        const aTime = aDate?.getTime() ?? missingDate;
        const bTime = bDate?.getTime() ?? missingDate;
        return buyerSort === 'purchase_recent' ? bTime - aTime : aTime - bTime;
      });
  }, [buyerSort, buyerSummaries, view]);

  const unmatchedCoursePurchases = useMemo(() => {
    return allTimeCoursePurchases
      .filter((purchase) => {
        if (purchase.customerName !== '-') return false;
        if (view === 'frontend') return purchase.category === 'frontend';
        if (view === 'backend') {
          return ['backend', 'backend_performance', 'backend_renewal'].includes(purchase.category);
        }
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allTimeCoursePurchases, view]);

  const activeRenewalCount = useMemo(
    () => buyerSummaries.filter((buyer) => buyer.hasBackend && buyer.status === 'active').length,
    [buyerSummaries]
  );

  const monthlySalesTotals = useMemo(() => {
    const totals = {
      frontend: 0,
      backend: 0,
      backend_performance: 0,
      backend_renewal: 0,
      analyca: 0,
      corporate: 0,
      other: 0,
      total: 0,
    };
    for (const row of monthlySalesFiltered) {
      totals.frontend += row.frontend;
      totals.backend += row.backend;
      totals.backend_performance += row.backend_performance;
      totals.backend_renewal += row.backend_renewal;
      totals.analyca += row.analyca;
      totals.corporate += row.corporate;
      totals.other += row.other;
      totals.total += row.total;
    }
    return totals;
  }, [monthlySalesFiltered]);

  const frontendCountForRate = mainCategoryStats.frontend.count;
  const backendCountForRate = mainCategoryStats.backend.count;
  const oneTimeSalesAmount = mainCategoryStats.frontend.amount + mainCategoryStats.backend.amount;
  const recurringSalesAmount = mainCategoryStats.backend_renewal.amount + mainCategoryStats.analyca.amount;
  const totalSalesAmount = groupedStats.totalAmount;

  const paymentMethodStats = useMemo(() => {
    let cardAmount = 0;
    let bankAmount = 0;

    for (const tx of displayTransactions) {
      if (tx.isGrouped) {
        for (const item of tx.items) {
          if (item.source === 'manual') {
            bankAmount += item.amount;
          } else {
            cardAmount += item.amount;
          }
        }
        continue;
      }
      if (tx.source === 'manual') {
        bankAmount += tx.amount;
      } else {
        cardAmount += tx.amount;
      }
    }

    const total = cardAmount + bankAmount;
    return {
      cardAmount,
      bankAmount,
      cardRate: total > 0 ? (cardAmount / total) * 100 : 0,
      bankRate: total > 0 ? (bankAmount / total) * 100 : 0,
    };
  }, [displayTransactions]);

  const lineToFrontendRate = useMemo(() => {
    if (lineRegistrationsInRange === null || lineRegistrationsInRange === 0) return null;
    return (frontendCountForRate / lineRegistrationsInRange) * 100;
  }, [frontendCountForRate, lineRegistrationsInRange]);

  const frontendToBackendRate = useMemo(() => {
    if (frontendCountForRate === 0) return null;
    return (backendCountForRate / frontendCountForRate) * 100;
  }, [backendCountForRate, frontendCountForRate]);

  // カテゴリ別売上を集計（グループ化考慮）
  const categoryStatsGrouped = useMemo(() => {
    const stats: Record<SalesCategoryId, { amount: number; count: number }> = {
      frontend: { amount: 0, count: 0 },
      backend: { amount: 0, count: 0 },
      backend_performance: { amount: 0, count: 0 },
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

    // 土日・祝日は翌営業日に調整
    const isNonBusinessDay = (date: Date) => {
      const dayOfWeek = date.getDay();
      return dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(date);
    };

    while (isNonBusinessDay(paymentDate)) {
      paymentDate.setDate(paymentDate.getDate() + 1);
    }

    return paymentDate;
  };

  // 入金済み・入金予定を計算
  const paymentStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cardFeeRate = 0.036;
    const applyCardFee = (amount: number) => Math.round(amount * (1 - cardFeeRate));
    const rangeStart = new Date(dateRange.from + 'T00:00:00');
    const rangeEnd = new Date(dateRange.to + 'T00:00:00');
    const currentMonthKey = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // ローカル日付をYYYY-MM-DD形式で取得
    const toLocalDateStr = toLocalDateKey;

    let deposited = 0; // 入金済み（入金日ベース）
    let pending = 0; // 入金予定（売上日ベース）
    let depositedBankTransfer = 0;
    const depositedPrevMonthCardByDate = new Map<string, number>();
    const pendingByDate = new Map<string, number>(); // 入金予定日別

    const addDepositedByPaymentDate = (paymentDate: Date, amount: number, isCard: boolean, saleDate?: Date) => {
      if (paymentDate < rangeStart || paymentDate > rangeEnd) return;
      const adjustedAmount = isCard ? applyCardFee(amount) : amount;
      if (paymentDate <= today) {
        deposited += adjustedAmount;
        if (!isCard) {
          depositedBankTransfer += adjustedAmount;
        } else if (saleDate) {
          const saleMonthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
          if (saleMonthKey === prevMonthKey) {
            const dateKey = toLocalDateStr(paymentDate);
            depositedPrevMonthCardByDate.set(dateKey, (depositedPrevMonthCardByDate.get(dateKey) ?? 0) + adjustedAmount);
          }
        }
      }
    };

    // 入金済み（入金日ベース）はキャッシュフロー用データで計算
    const cashflowCharges = ((fullData?.cashflowCharges ?? initialData.cashflowCharges) ?? charges).filter(c => c.status === 'successful');
    for (const charge of cashflowCharges) {
      const saleDate = new Date(charge.created_on);
      const paymentDate = getPaymentDate(saleDate);
      addDepositedByPaymentDate(paymentDate, charge.charged_amount, true, saleDate);
    }
    for (const sale of manualSales) {
      const paymentDateStr = sale.paymentDate || sale.transactionDate;
      const paymentDate = new Date(paymentDateStr + 'T00:00:00');
      addDepositedByPaymentDate(paymentDate, sale.amount, false, paymentDate);
    }

    // 入金予定（売上日ベース）は表示期間の売上から計算
    for (const tx of displayTransactions) {
      if (tx.isGrouped) {
        for (const item of tx.items) {
          if (item.source !== 'manual') {
            const paymentDate = getPaymentDate(item.date);
            if (paymentDate > today) {
              const adjustedAmount = applyCardFee(item.amount);
              pending += adjustedAmount;
              const dateKey = toLocalDateStr(paymentDate);
              pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + adjustedAmount);
            }
          } else {
            const manualPaymentDate = item.paymentDate ?? item.date;
            if (manualPaymentDate > today && manualPaymentDate >= rangeStart && manualPaymentDate <= rangeEnd) {
              pending += item.amount;
              const dateKey = toLocalDateStr(manualPaymentDate);
              pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + item.amount);
            }
          }
        }
      } else if (tx.source === 'univapay') {
        const paymentDate = getPaymentDate(tx.date);
        if (paymentDate > today) {
          const adjustedAmount = applyCardFee(tx.amount);
          pending += adjustedAmount;
          const dateKey = toLocalDateStr(paymentDate);
          pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + adjustedAmount);
        }
      } else if (tx.source === 'manual') {
        const manualPaymentDate = tx.paymentDate ?? tx.date;
        if (manualPaymentDate > today && manualPaymentDate >= rangeStart && manualPaymentDate <= rangeEnd) {
          pending += tx.amount;
          const dateKey = toLocalDateStr(manualPaymentDate);
          pendingByDate.set(dateKey, (pendingByDate.get(dateKey) ?? 0) + tx.amount);
        }
      }
    }

    // 入金予定日別にソート
    const pendingSchedule = Array.from(pendingByDate.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const prevMonthCardSchedule = Array.from(depositedPrevMonthCardByDate.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      deposited,
      pending,
      pendingSchedule,
      depositedBankTransfer,
      prevMonthCardSchedule,
      prevMonthKey,
      currentMonthKey,
    };
  }, [displayTransactions, manualSales, dateRange.from, dateRange.to, fullData, initialData.cashflowCharges, charges]);

  if (view === 'analyca') {
    return (
      <AnalycaSalesView
        items={analycaRevenueItems}
        dateRange={dateRange}
      />
    );
  }

  if (view === 'profit') {
    return (
      <SalesProfitView
        revenueItems={selectedRangeRevenueItems}
        dateRange={dateRange}
      />
    );
  }

  if (view !== 'main') {
    const viewLabel =
      view === 'frontend' ? 'フロントエンド' : view === 'backend' ? 'バックエンド' : '講座';
    return (
      <>
        <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${
          view === 'frontend' ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
        }`}>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
              {view === 'courses' ? '講座の総売上' : `${viewLabel}売上`}
            </p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
              {view === 'courses'
                ? `¥${numberFormatter.format(
                    selectedRangeCourseSalesBreakdown.frontend +
                    selectedRangeCourseSalesBreakdown.backend +
                    selectedRangeCourseSalesBreakdown.renewal
                  )}`
                : `¥${numberFormatter.format(
                    view === 'frontend'
                      ? selectedRangeCourseSalesBreakdown.frontend
                      : selectedRangeCourseSalesBreakdown.backend +
                        selectedRangeCourseSalesBreakdown.renewal
                  )}`}
            </p>
          </Card>
          {view === 'courses' ? (
            <>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  フロント売上
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  ¥{numberFormatter.format(selectedRangeCourseSalesBreakdown.frontend)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  バックエンド売上
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  ¥{numberFormatter.format(
                    selectedRangeCourseSalesBreakdown.backend +
                    selectedRangeCourseSalesBreakdown.renewal
                  )}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  初回・成果報酬・継続を合算
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  LINEリスト単価
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {courseMetrics.listUnitValue === null
                    ? '—'
                    : `¥${numberFormatter.format(courseMetrics.listUnitValue)}`}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  期間内LINE登録者1人あたりの講座累計売上
                </p>
              </Card>
            </>
          ) : null}
          {view === 'frontend' ? (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                期間内フロント購入者
              </p>
              <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                {numberFormatter.format(courseMetrics.frontendBuyerCount)}人
              </p>
            </Card>
          ) : null}
          {view === 'backend' ? (
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                期間内初回バック購入者
              </p>
              <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                {numberFormatter.format(courseMetrics.backendBuyerCount)}人
              </p>
            </Card>
          ) : null}
          {view === 'frontend' ? (
            <>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  期間内LINE新規登録
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {numberFormatter.format(lineRegistrationsInRange ?? 0)}人
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  期間内フロントCVR
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {courseMetrics.frontendCvr === null
                    ? '—'
                    : `${courseMetrics.frontendCvr.toFixed(1)}%`}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  LINEリスト単価
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {courseMetrics.listUnitValue === null
                    ? '—'
                    : `¥${numberFormatter.format(courseMetrics.listUnitValue)}`}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  平均LTV × 期間内フロントCVR
                </p>
              </Card>
            </>
          ) : null}
          {view === 'backend' ? (
            <>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  継続売上
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  ¥{numberFormatter.format(selectedRangeCourseSalesBreakdown.renewal)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  現在の継続人数
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {numberFormatter.format(activeRenewalCount)}人
                </p>
              </Card>
            </>
          ) : null}
          {view === 'courses' ? (
            <>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  期間内フロント購入者
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {numberFormatter.format(courseMetrics.frontendBuyerCount)}人
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  期間内初回バック購入者
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {numberFormatter.format(courseMetrics.backendBuyerCount)}人
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  期間内 フロント→バック転換率
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {courseMetrics.frontendToBackendRate === null
                    ? '—'
                    : `${courseMetrics.frontendToBackendRate.toFixed(1)}%`}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
                  平均LTV（フロント購入者）
                </p>
                <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                  {courseMetrics.averageLtv === null
                    ? '—'
                    : `¥${numberFormatter.format(courseMetrics.averageLtv)}`}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  対象者のフロント＋バック売上 ÷ 対象者数
                </p>
              </Card>
            </>
          ) : null}
        </div>

        <Card className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
                月別 売上推移
              </h2>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-1 text-xs">
                {([
                  ['amount', '売上金額'],
                  ['count', '購入件数'],
                ] as const).map(([metric, label]) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setMonthlyMetric(metric)}
                    className={
                      monthlyMetric === metric
                        ? 'rounded-[var(--radius-sm)] bg-white px-3 py-1.5 font-semibold text-[color:var(--color-text-primary)] shadow-sm'
                        : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-1 text-xs">
                {[3, 6, 12].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setMonthlyRangeMonths(months as 3 | 6 | 12)}
                    className={
                      monthlyRangeMonths === months
                        ? 'rounded-[var(--radius-sm)] bg-white px-3 py-1.5 font-semibold text-[color:var(--color-text-primary)] shadow-sm'
                        : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                    }
                  >
                    直近{months}ヶ月
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 h-80">
            {segmentMonthlyChartData.length > 0 ? (
              <ResponsiveContainer>
                <ComposedChart data={segmentMonthlyChartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="primary"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#475569' }}
                    tickFormatter={(value) =>
                      monthlyMetric === 'count'
                        ? `${numberFormatter.format(value)}件`
                        : `¥${(value / 10000).toFixed(0)}万`
                    }
                  />
                  {view === 'frontend' ? (
                    <YAxis
                      yAxisId="counts"
                      orientation="right"
                      hide
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#475569' }}
                      tickFormatter={(value) => `${numberFormatter.format(value)}人`}
                    />
                  ) : null}
                  {view === 'frontend' ? (
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as {
                          total?: number;
                          purchaseCount?: number;
                          firstBuyerCount?: number;
                          lineRegistrations?: number;
                          frontendCvr?: number | null;
                        };
                        return (
                          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 text-xs shadow-lg">
                            <p className="font-semibold text-[color:var(--color-text-primary)]">{label}</p>
                            <div className="mt-2 space-y-1 text-[color:var(--color-text-secondary)]">
                              <p>売上：¥{numberFormatter.format(Number(row.total ?? 0))}</p>
                              <p>購入件数：{numberFormatter.format(Number(row.purchaseCount ?? 0))}件</p>
                              <p>初回購入者：{numberFormatter.format(Number(row.firstBuyerCount ?? 0))}人</p>
                              <p>新規LINE登録：{numberFormatter.format(Number(row.lineRegistrations ?? 0))}人</p>
                              <p>月別CVR：{row.frontendCvr == null ? '—' : `${row.frontendCvr.toFixed(1)}%`}</p>
                            </div>
                          </div>
                        );
                      }}
                    />
                  ) : (
                    <Tooltip
                      formatter={(value, name) => [
                        monthlyMetric === 'count'
                          ? `${numberFormatter.format(Number(value ?? 0))}件`
                          : `¥${numberFormatter.format(Number(value ?? 0))}`,
                        String(name),
                      ]}
                    />
                  )}
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {segmentCategories.map((category) => (
                    <Bar
                      key={category.id}
                      dataKey={category.id}
                      name={category.label}
                      stackId="sales"
                      yAxisId="primary"
                      fill={category.color}
                      opacity={0.9}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="合計"
                    yAxisId="primary"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  {view === 'frontend' ? (
                    <Line
                      type="monotone"
                      dataKey="lineRegistrations"
                      name="新規LINE登録者"
                      yAxisId="counts"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
                <p className="text-sm text-[color:var(--color-text-muted)]">
                  月別売上データがありません
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
                {view === 'courses' ? '受講生一覧' : '購入者一覧'}
              </h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
              並び替え
              <select
                aria-label="購入者一覧の並び替え"
                value={buyerSort}
                onChange={(event) => setBuyerSort(event.target.value as BuyerSort)}
                className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
              >
                <option value="purchase_recent">
                  {view === 'backend' ? 'バックエンド購入日が新しい順' : '購入日が新しい順'}
                </option>
                <option value="purchase_oldest">
                  {view === 'backend' ? 'バックエンド購入日が古い順' : '購入日が古い順'}
                </option>
                <option value="ltv_desc">全期間LTVが高い順</option>
              </select>
            </label>
          </div>
          {visibleBuyerSummaries.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <thead className="bg-[color:var(--color-surface-muted)] text-xs uppercase text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">購入者</th>
                    <th className="px-3 py-2 text-left">ステータス</th>
                    <th className="px-3 py-2 text-right">全期間LTV</th>
                    {view === 'frontend' ? (
                      <>
                        <th className="px-3 py-2 text-left">フロント初回購入日</th>
                        <th className="px-3 py-2 text-left">バック初回購入日</th>
                        <th className="px-3 py-2 text-right">フロント売上</th>
                        <th className="px-3 py-2 text-right">フロント購入件数</th>
                      </>
                    ) : view === 'backend' ? (
                      <>
                        <th className="px-3 py-2 text-left">F購入日</th>
                        <th className="px-3 py-2 text-left">B購入日</th>
                        <th className="px-3 py-2 text-right">バック売上</th>
                        <th className="px-3 py-2 text-right">継続売上</th>
                        <th className="px-3 py-2 text-left">継続開始日</th>
                        <th className="px-3 py-2 text-right">継続月数</th>
                        <th className="px-3 py-2 text-left">契約終了目安</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-left">購入区分</th>
                        <th className="px-3 py-2 text-right">購入件数</th>
                        <th className="px-3 py-2 text-left">最終購入日</th>
                      </>
                    )}
                    <th className="px-3 py-2 text-left">購入紐付け</th>
                    <th className="px-3 py-2 text-left">直近決済日</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBuyerSummaries.map((buyer) => {
                    const profile: CustomerProfile = {
                      customerKey: buyer.customerKey,
                      displayName: buyer.displayName,
                      status: buyer.status,
                      courseName: buyer.courseName,
                      lineDisplayName: buyer.lineDisplayName,
                      aliases: buyer.aliases,
                      updatedAt: buyer.profile?.updatedAt ?? '',
                    };
                    return (
                    <tr key={buyer.customerKey} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-[color:var(--color-text-primary)]">
                        {buyer.displayName}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <select
                          value={buyer.status}
                          onChange={(event) =>
                            handleCustomerProfileUpdate({
                              ...profile,
                              status: event.target.value as CustomerStatus,
                            })
                          }
                          disabled={savingCustomerKey === buyer.customerKey}
                          className={`rounded-[var(--radius-sm)] border px-2 py-1 text-sm font-medium disabled:opacity-50 ${
                            view === 'backend' || view === 'courses'
                              ? CUSTOMER_STATUS_STYLES[buyer.status]
                              : 'border-[color:var(--color-border)] bg-white text-[color:var(--color-text-primary)]'
                          }`}
                        >
                          {CUSTOMER_STATUS_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                        ¥{numberFormatter.format(buyer.ltv)}
                      </td>
                      {view === 'frontend' ? (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.firstFrontendDate ? formatJapanDate(buyer.firstFrontendDate) : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.firstBackendDate ? formatJapanDate(buyer.firstBackendDate) : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                            ¥{numberFormatter.format(buyer.frontendAmount)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                            {numberFormatter.format(buyer.frontendPurchaseCount)}件
                          </td>
                        </>
                      ) : view === 'backend' ? (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.firstFrontendDate ? formatJapanDate(buyer.firstFrontendDate) : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.firstBackendDate ? formatJapanDate(buyer.firstBackendDate) : '未確認'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                            ¥{numberFormatter.format(buyer.backendAmount)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                            ¥{numberFormatter.format(buyer.backendRenewalAmount)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.renewalStartDate ? formatJapanDate(buyer.renewalStartDate) : '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                            {numberFormatter.format(buyer.renewalMonths)}ヶ月
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.nextContractEndDate ? formatJapanDate(buyer.nextContractEndDate) : '-'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {buyer.hasBackend ? 'バックエンド' : 'フロントのみ'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                            {numberFormatter.format(buyer.purchaseCount)}件
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatJapanDate(buyer.lastPurchaseDate)}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 min-w-48">
                        <div className="flex flex-wrap gap-1">
                          {buyer.categories.map((categoryId) => (
                            <span
                              key={categoryId}
                              className="rounded-full bg-[color:var(--color-surface-muted)] px-2 py-0.5 text-xs"
                            >
                              {SALES_CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatJapanDate(buyer.lastPaymentDate)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] p-8 text-center text-sm text-[color:var(--color-text-muted)]">
              対象の購入データがありません
            </div>
          )}
          {unmatchedCoursePurchases.length > 0 ? (
            <div className="mt-6 border-t border-[color:var(--color-border)] pt-5">
              <h3 className="font-semibold text-amber-700">
                購入者名 要確認（{unmatchedCoursePurchases.length}件）
              </h3>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <thead className="bg-amber-50 text-xs text-amber-800">
                    <tr>
                      <th className="px-3 py-2 text-left">購入日</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">カテゴリー</th>
                      <th className="px-3 py-2 text-left">データ元</th>
                      <th className="px-3 py-2 text-left">明細ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedCoursePurchases.map((purchase) => (
                      <tr key={purchase.id} className="border-t border-[color:var(--color-border)]">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatJapanDate(purchase.date)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right font-medium tabular-nums">
                          ¥{numberFormatter.format(purchase.amount)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {SALES_CATEGORIES.find((category) => category.id === purchase.category)?.label
                            ?? purchase.category}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{purchase.source}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                          {purchase.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            購入明細
          </h2>
          {segmentPurchases.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <thead className="bg-[color:var(--color-surface-muted)] text-xs uppercase text-[color:var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">日付</th>
                    <th className="px-3 py-2 text-left">購入者</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">カテゴリー</th>
                    <th className="px-3 py-2 text-left">データ元</th>
                    <th className="px-3 py-2 text-left">支払方法</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentPurchases.map((purchase) => (
                    <tr key={`${purchase.source}:${purchase.id}`} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatJapanDate(purchase.date)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-[color:var(--color-text-primary)]">
                        {purchase.customerName}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                        ¥{numberFormatter.format(purchase.amount)}
                        {purchase.itemCount > 1 ? (
                          <span className="ml-1 text-xs text-[color:var(--color-text-muted)]">
                            ({purchase.itemCount}明細)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {SALES_CATEGORIES.find((category) => category.id === purchase.category)?.label ?? '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{purchase.source}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{purchase.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] p-8 text-center text-sm text-[color:var(--color-text-muted)]">
              対象の購入データがありません
            </div>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      {/* サマリーカード */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            売上合計
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(groupedStats.totalAmount)}
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            取引件数 {numberFormatter.format(groupedStats.totalCount)}件
            <br />
            平均単価 ¥{numberFormatter.format(averageAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            入金済み
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ¥{numberFormatter.format(paymentStats.deposited)}
          </p>
          <div className="mt-2 space-y-2 text-xs text-[color:var(--color-text-muted)]">
            <div className="flex items-center justify-between">
              <span>銀行振込（{paymentStats.currentMonthKey}）</span>
              <span className="font-medium text-[color:var(--color-text-primary)]">
                ¥{numberFormatter.format(paymentStats.depositedBankTransfer)}
              </span>
            </div>
            <div>
              <p className="text-[color:var(--color-text-secondary)]">カード入金（{paymentStats.prevMonthKey} 売上）</p>
              {paymentStats.prevMonthCardSchedule.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {paymentStats.prevMonthCardSchedule.map(({ date, amount }) => {
                    const [y, m, d] = date.split('-').map(Number);
                    const localDate = new Date(y, m - 1, d);
                    return (
                      <div key={date} className="flex items-center justify-between">
                        <span>{localDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
                        <span className="font-medium text-[color:var(--color-text-primary)]">
                          ¥{numberFormatter.format(amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1">該当なし</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            入金予定
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            ¥{numberFormatter.format(paymentStats.pending)}
          </p>
          <div className="mt-2 space-y-1 text-xs text-[color:var(--color-text-muted)]">
            {paymentStats.pendingSchedule.length > 0 ? (
              paymentStats.pendingSchedule.map(({ date, amount }) => {
                // YYYY-MM-DD形式をローカル日付としてパース
                const [y, m, d] = date.split('-').map(Number);
                const localDate = new Date(y, m - 1, d);
                return (
                  <div key={date} className="flex items-center justify-between">
                    <span>{localDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
                    <span className="font-medium text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(amount)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p>入金予定なし</p>
            )}
          </div>
        </Card>
      </div>

      {/* カテゴリ別売上 */}
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              カテゴリ別売上
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              売上構成比と転換率をまとめて確認
            </p>
          </div>
        </div>
        {categoryStatsGrouped.length > 0 ? (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={categoryStatsGrouped}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
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
              </div>
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="text-xs font-medium text-[color:var(--color-text-muted)]">銀行振込 / カード 比率</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[color:var(--color-text-secondary)]">銀行振込</span>
                    <span className="font-semibold text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(paymentMethodStats.bankAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>割合</span>
                    <span>{paymentMethodStats.bankRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[color:var(--color-text-secondary)]">カード</span>
                    <span className="font-semibold text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(paymentMethodStats.cardAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>割合</span>
                    <span>{paymentMethodStats.cardRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="text-xs font-medium text-[color:var(--color-text-muted)]">単発 / 継続 売上</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[color:var(--color-text-secondary)]">単発売上</span>
                    <span className="font-semibold text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(oneTimeSalesAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>割合</span>
                    <span>{totalSalesAmount > 0 ? `${((oneTimeSalesAmount / totalSalesAmount) * 100).toFixed(1)}%` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[color:var(--color-text-secondary)]">継続売上</span>
                    <span className="font-semibold text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(recurringSalesAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>割合</span>
                    <span>{totalSalesAmount > 0 ? `${((recurringSalesAmount / totalSalesAmount) * 100).toFixed(1)}%` : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
                <div className="grid items-center gap-2 md:grid-cols-5">
                  <div>
                    <p className="text-xs font-medium text-[color:var(--color-text-muted)]">LINE登録</p>
                    <p className="mt-1 text-xl font-semibold text-[color:var(--color-text-primary)]">
                      {lineRegistrationsInRange !== null ? numberFormatter.format(lineRegistrationsInRange) : '—'}人
                    </p>
                  </div>
                  <div className="text-center text-xs text-[color:var(--color-text-muted)]">
                    <div className="text-base text-[color:var(--color-text-secondary)]">→</div>
                    <div>{lineToFrontendRate !== null ? `${lineToFrontendRate.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[color:var(--color-text-muted)]">フロント成約</p>
                    <p className="mt-1 text-xl font-semibold text-[color:var(--color-text-primary)]">
                      {numberFormatter.format(frontendCountForRate)}件
                    </p>
                  </div>
                  <div className="text-center text-xs text-[color:var(--color-text-muted)]">
                    <div className="text-base text-[color:var(--color-text-secondary)]">→</div>
                    <div>{frontendToBackendRate !== null ? `${frontendToBackendRate.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[color:var(--color-text-muted)]">バック成約</p>
                    <p className="mt-1 text-xl font-semibold text-[color:var(--color-text-primary)]">
                      {numberFormatter.format(backendCountForRate)}件
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t border-[color:var(--color-border)] pt-2 text-xs text-[color:var(--color-text-muted)]">
                  全体転換率（LINE→バック）：
                  <span className="ml-1 font-medium text-[color:var(--color-text-primary)]">
                    {lineRegistrationsInRange && lineRegistrationsInRange > 0
                      ? `${((backendCountForRate / lineRegistrationsInRange) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              </div>
              {categoryStatsGrouped.map(cat => {
                const ratio = groupedStats.totalAmount > 0 ? (cat.amount / groupedStats.totalAmount) * 100 : 0;
                return (
                  <div key={cat.id} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <div>
                          <p className="text-sm font-medium text-[color:var(--color-text-primary)]">
                            {cat.label}
                          </p>
                          <p className="text-xs text-[color:var(--color-text-muted)]">
                            {cat.count}件
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
                          ¥{numberFormatter.format(cat.amount)}
                        </p>
                        <p className="text-xs text-[color:var(--color-text-muted)]">
                          {ratio.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-border)]">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min(100, ratio)}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-[color:var(--color-text-muted)]">
              取引一覧からカテゴリを設定してください
            </p>
          </div>
        )}
        <div className="mt-6"></div>
      </Card>

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

      {/* 月別 売上推移 */}
      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              月別 売上推移
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              カテゴリ内訳の積み上げ棒と合計（折れ線）／下段にカテゴリ別明細
            </p>
          </div>
          <div className="flex gap-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-1 text-xs">
            {[3, 6, 12].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMonthlyRangeMonths(n as 3 | 6 | 12)}
                className={
                  monthlyRangeMonths === n
                    ? 'rounded-[var(--radius-sm)] bg-white px-3 py-1.5 font-semibold text-[color:var(--color-text-primary)] shadow-sm'
                    : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                }
              >
                直近{n}ヶ月
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-80">
          {monthlySalesFiltered.length > 0 ? (
            <ResponsiveContainer>
              <ComposedChart data={monthlySalesFiltered} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const totalEntry = payload.find((p) => p.dataKey === 'total');
                    const total = typeof totalEntry?.value === 'number' ? totalEntry.value : 0;
                    const categoryEntries = payload
                      .filter((p) => p.dataKey !== 'total' && typeof p.value === 'number' && (p.value as number) > 0)
                      .map((p) => ({
                        name: p.name as string,
                        value: p.value as number,
                        color: (p.color ?? p.fill ?? '#64748b') as string,
                      }))
                      .sort((a, b) => b.value - a.value);
                    return (
                      <div className="rounded-md border border-[color:var(--color-border)] bg-white px-3 py-2 shadow-md">
                        <p className="mb-2 text-sm font-semibold text-[color:var(--color-text-primary)]">{label}</p>
                        <div className="space-y-1 text-sm">
                          {categoryEntries.map((entry) => {
                            const pct = total > 0 ? (entry.value / total) * 100 : 0;
                            return (
                              <div key={entry.name} className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-2" style={{ color: entry.color }}>
                                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                                  {entry.name}
                                </span>
                                <span style={{ color: entry.color }}>
                                  ¥{numberFormatter.format(entry.value)}（{pct.toFixed(1)}%）
                                </span>
                              </div>
                            );
                          })}
                          <div className="mt-2 flex items-center justify-between gap-4 border-t border-[color:var(--color-border)] pt-2 font-semibold text-[color:var(--color-text-primary)]">
                            <span>合計</span>
                            <span>¥{numberFormatter.format(total)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SALES_CATEGORIES.map((cat) => (
                  <Bar
                    key={cat.id}
                    dataKey={cat.id}
                    name={cat.label}
                    stackId="sales"
                    fill={cat.color}
                    radius={[0, 0, 0, 0]}
                    opacity={0.9}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="total"
                  name="合計"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                月別売上データがありません
              </p>
            </div>
          )}
        </div>

        {monthlySalesFiltered.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <Table>
              <thead className="bg-[color:var(--color-surface-muted)] text-xs uppercase text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">月</th>
                  {SALES_CATEGORIES.map((cat) => (
                    <th key={cat.id} className="px-3 py-2 text-right whitespace-nowrap">
                      <span
                        className="inline-block h-2 w-2 rounded-sm align-middle mr-1"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right whitespace-nowrap">合計</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] font-semibold text-[color:var(--color-text-primary)]">
                  <td className="px-3 py-2">期間合計</td>
                  {SALES_CATEGORIES.map((cat) => {
                    const val = monthlySalesTotals[cat.id];
                    const pct = monthlySalesTotals.total > 0 ? (val / monthlySalesTotals.total) * 100 : 0;
                    return (
                      <td key={cat.id} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        <div>¥{numberFormatter.format(val)}</div>
                        <div className="text-xs font-normal text-[color:var(--color-text-muted)]">
                          {pct.toFixed(1)}%
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    ¥{numberFormatter.format(monthlySalesTotals.total)}
                  </td>
                </tr>
                {[...monthlySalesFiltered].reverse().map((row) => (
                  <tr key={row.month} className="border-t border-[color:var(--color-border)]">
                    <td className="px-3 py-2 font-medium text-[color:var(--color-text-primary)] whitespace-nowrap">
                      {row.month}
                    </td>
                    {SALES_CATEGORIES.map((cat) => {
                      const val = row[cat.id];
                      const pct = row.total > 0 ? (val / row.total) * 100 : 0;
                      return (
                        <td key={cat.id} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          <div>¥{numberFormatter.format(val)}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {pct.toFixed(1)}%
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-[color:var(--color-text-primary)] tabular-nums">
                      ¥{numberFormatter.format(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* 月別 成約数/転換率 推移 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          月別 成約数 / 転換率 推移
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          日付フィルタの対象外（直近12ヶ月）
        </p>
        <div className="mt-4 h-72">
          {monthlyCounts.length > 0 ? (
            <ResponsiveContainer>
              <ComposedChart data={monthlyCounts} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'フロント→バック率') return [`${value.toFixed(1)}%`, name];
                    return [value, name];
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="frontend"
                  name="フロント件数"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  opacity={0.85}
                />
                <Bar
                  yAxisId="left"
                  dataKey="backend"
                  name="バック件数"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  opacity={0.85}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="frontendToBackendRate"
                  name="フロント→バック率"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                成約数データがありません
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
                  入金予定日（任意）
                </label>
                <input
                  type="date"
                  value={manualFormData.paymentDate}
                  onChange={(e) => setManualFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
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
                        ) : manualItem && !tx.isGrouped ? (
                          <select
                            value={tx.category ?? 'other'}
                            onChange={(e) => handleManualCategoryChange(manualItem.id, e.target.value as SalesCategoryId)}
                            disabled={savingCategory === manualItem.id}
                            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2 py-1 text-sm disabled:opacity-50"
                          >
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
