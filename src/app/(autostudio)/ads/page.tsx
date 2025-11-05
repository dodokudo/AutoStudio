import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';

const PRIMARY_KPI = [
  { label: '消化金額', value: '—' },
  { label: 'インプレッション', value: '—' },
  { label: 'クリック', value: '—' },
  { label: 'CTAクリック', value: '—' },
  { label: 'LINE登録', value: '—' },
];

const COST_METRICS = [
  { label: '消化金額', value: '—' },
  { label: 'CPM', value: '—' },
  { label: 'CPC', value: '—' },
  { label: 'LPC', value: '—' },
  { label: 'CPA', value: '—' },
];

export default function AdsPage() {
  return (
    <div className="section-stack">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">広告ダッシュボード</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">広告指標の連携準備中です。</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PRIMARY_KPI.map((item) => (
            <div key={item.label} className={dashboardCardClass}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">費用指標</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">費用関連のKPIはデータ連携後に表示されます。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {COST_METRICS.map((item) => (
            <div key={item.label} className={dashboardCardClass}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
