'use client';

import { useState, useTransition, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import type { KpiTarget, KpiTargetInput } from '@/lib/home/kpi-types';
import type { HomeDashboardData } from '@/lib/home/dashboard';
import { KpiTargetTab } from './KpiTargetTab';
import { DashboardTab } from './DashboardTab';
import { UNIFIED_RANGE_OPTIONS, isUnifiedRangePreset } from '@/lib/dateRangePresets';

// ============================================================
// 型定義
// ============================================================

const HOME_TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'kpi_settings', label: 'KPI目標設定' },
] as const;

type HomeTabKey = (typeof HOME_TABS)[number]['id'];

const TAB_SKELETON_SECTIONS: Record<HomeTabKey, number> = {
  dashboard: 4,
  kpi_settings: 2,
};

const TAB_SKELETON_DELAY_MS = 240;

// ============================================================
// Props
// ============================================================

export interface HomeDashboardClientProps {
  initialDashboardData: HomeDashboardData;
  initialKpiTarget: KpiTarget | null;
  currentMonth: string; // 'YYYY-MM'
  selectedRange: string;
  customStart?: string;
  customEnd?: string;
}

// ============================================================
// コンポーネント
// ============================================================

export function HomeDashboardClient({
  initialDashboardData,
  initialKpiTarget,
  currentMonth,
  selectedRange,
  customStart,
  customEnd,
}: HomeDashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // タブ状態
  const [activeTab, setActiveTab] = useState<HomeTabKey>('dashboard');
  const [pendingTab, setPendingTab] = useState<HomeTabKey | null>(null);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // KPI目標状態
  const [kpiTarget, setKpiTarget] = useState<KpiTarget | null>(initialKpiTarget);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // タブ切り替えハンドラ
  const handleTabChange = useCallback((next: string) => {
    if (next === activeTab) return;
    const nextTab = next as HomeTabKey;
    setPendingTab(nextTab);
    setIsTabLoading(true);

    // 少し遅延を入れてローディング表示
    setTimeout(() => {
      startTransition(() => {
        setActiveTab(nextTab);
        setIsTabLoading(false);
        setPendingTab(null);
      });
    }, TAB_SKELETON_DELAY_MS);
  }, [activeTab]);

  const handleRangeChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const preset = isUnifiedRangePreset(value) ? value : 'this-month';
    params.set('range', preset);
    if (preset !== 'custom') {
      params.delete('start');
      params.delete('end');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleCustomRangeChange = useCallback((start: string, end: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    if (start) {
      params.set('start', start);
    } else {
      params.delete('start');
    }
    if (end) {
      params.set('end', end);
    } else {
      params.delete('end');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // KPI目標保存ハンドラ
  const handleKpiSave = useCallback(async (input: KpiTargetInput) => {
    const response = await fetch('/api/home/kpi-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error('Failed to save KPI target');
    }

    const result = await response.json();
    if (result.success && result.data) {
      setKpiTarget(result.data);
      setSelectedMonth(input.targetMonth);
    }
    return result.data;
  }, []);

  // 月変更ハンドラ
  const handleMonthChange = useCallback(async (month: string) => {
    setSelectedMonth(month);

    // 該当月のKPI目標を取得
    try {
      const response = await fetch(`/api/home/kpi-targets?month=${month}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setKpiTarget(result.data?.id ? result.data : null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch KPI target:', error);
    }
  }, []);

  // スケルトン表示判定
  const currentTabForSkeleton = pendingTab ?? activeTab;

  return (
    <div className="space-y-6">
      {/* タブナビゲーション */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={HOME_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          value={activeTab}
          onChange={handleTabChange}
          className="flex-1 min-w-[160px]"
        />
        {activeTab === 'dashboard' ? (
          <DashboardDateRangePicker
            options={UNIFIED_RANGE_OPTIONS}
            value={selectedRange}
            onChange={handleRangeChange}
            allowCustom
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={handleCustomRangeChange}
          />
        ) : null}
      </div>

      {/* タブコンテンツ */}
      {isTabLoading ? (
        <PageSkeleton sections={TAB_SKELETON_SECTIONS[currentTabForSkeleton]} showFilters={false} />
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardTab
              data={initialDashboardData}
              kpiTarget={kpiTarget}
              currentMonth={selectedMonth}
            />
          )}
          {activeTab === 'kpi_settings' && (
            <KpiTargetTab
              initialTarget={kpiTarget}
              currentMonth={selectedMonth}
              onSave={handleKpiSave}
              onMonthChange={handleMonthChange}
            />
          )}
        </>
      )}
    </div>
  );
}
