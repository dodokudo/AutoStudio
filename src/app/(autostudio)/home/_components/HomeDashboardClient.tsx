'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { KpiTarget, KpiTargetInput } from '@/lib/home/kpi-types';
import { isMonth } from '@/lib/home/monthly-plan-types';
import type { HomeDashboardData } from '@/lib/home/dashboard';
import { KpiTargetTab } from './KpiTargetTab';
import { DashboardTab } from './DashboardTab';
import { ReportTab } from './ReportTab';

const tabs = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'kpi_settings', label: 'KPI目標設定' },
  { id: 'report', label: 'レポート' },
];
export function HomeDashboardClient({
  initialDashboardData,
  initialKpiTarget,
  currentMonth,
}: {
  initialDashboardData: HomeDashboardData;
  initialKpiTarget: KpiTarget | null;
  currentMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'kpi_settings'
      ? 'kpi_settings'
      : searchParams.get('tab') === 'report'
        ? 'report'
        : 'dashboard'
  );
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState(initialKpiTarget);
  async function save(input: KpiTargetInput) {
    const response = await fetch('/api/home/kpi-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error ?? '保存に失敗しました');
    setTarget(result.data);
    return result.data;
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          className="flex-1 min-w-[160px]"
        />
        <label className="flex items-center gap-2 text-sm">
          対象月
          <input
            aria-label="対象月"
            type="month"
            value={currentMonth}
            disabled={pending}
            onChange={(event) => {
              const month = event.target.value;
              if (!isMonth(month)) return;
              startTransition(() => router.replace(`${pathname}?month=${month}&tab=${activeTab}`, { scroll: false }));
            }}
            className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
          />
        </label>
      </div>
      {pending ? (
        <div className="flex justify-end">
          <LoadingSpinner size="sm" label="対象月を読み込み中" />
        </div>
      ) : null}
      <fieldset disabled={pending} className="min-w-0">
        {activeTab === 'dashboard' && (
          <DashboardTab data={initialDashboardData} kpiTarget={target} currentMonth={currentMonth} />
        )}
        {activeTab === 'kpi_settings' && (
          <KpiTargetTab initialTarget={target} currentMonth={currentMonth} onSave={save} />
        )}
        {activeTab === 'report' && <ReportTab currentMonth={currentMonth} />}
      </fieldset>
    </div>
  );
}
