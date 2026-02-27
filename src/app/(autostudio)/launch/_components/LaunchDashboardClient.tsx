'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';

import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { classNames } from '@/lib/classNames';

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

/* ---------- Types ---------- */

interface FunnelItem {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  baseDate: string | null;
  baseDateLabel: string | null;
  deliveryCount: number;
  segmentCount: number;
  updatedAt: string;
  label: string | null;
  status: string | null;
}

interface FunnelsResponse {
  funnels: FunnelItem[];
}

interface BroadcastItem {
  broadcast_id: string;
  broadcast_name: string;
  sent_at: string;
  delivery_count: number;
  open_count: number;
  open_rate: number;
  elapsed_minutes: number;
  measured_at: string;
}

interface BroadcastsResponse {
  broadcasts: BroadcastItem[];
}

/* ---------- Tabs ---------- */

const LAUNCH_TABS = [
  { id: 'funnels', label: 'ローンチ一覧' },
  { id: 'metrics', label: '配信メトリクス' },
] as const;

type LaunchTabKey = (typeof LAUNCH_TABS)[number]['id'];

/* ---------- Formatters ---------- */

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatDate(value: string | null): string {
  if (!value) return '-';
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/* ---------- Status helpers ---------- */

type FunnelStatus = '完了' | '実施中' | '準備中' | '不明';

function getFunnelStatus(startDate: string | null, endDate: string | null): FunnelStatus {
  if (!startDate && !endDate) return '不明';
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (end < now) return '完了';
  }

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (start > now) return '準備中';
  }

  return '実施中';
}

const statusStyles: Record<FunnelStatus, string> = {
  '完了': 'bg-[#e8e8e8] text-[#555]',
  '実施中': 'bg-[#dcf5e7] text-[#096c3e]',
  '準備中': 'bg-[#fff7e6] text-[#ad6800]',
  '不明': 'bg-[#f0f0f0] text-[#888]',
};

/* ---------- Main Component ---------- */

export function LaunchDashboardClient() {
  const [activeTab, setActiveTab] = useState<LaunchTabKey>('funnels');

  return (
    <div className="section-stack">
      <DashboardTabsInteractive
        items={[...LAUNCH_TABS]}
        value={activeTab}
        onChange={(v) => setActiveTab(v as LaunchTabKey)}
        aria-label="ローンチタブ"
      />

      {activeTab === 'funnels' && <FunnelList />}
      {activeTab === 'metrics' && <BroadcastMetrics />}
    </div>
  );
}

/* ---------- Available funnels type ---------- */

interface AvailableFunnel {
  id: string;
  name: string;
}

interface AvailableFunnelsResponse {
  funnels: AvailableFunnel[];
}

/* ---------- Funnel List (Registration-based) ---------- */

function FunnelList() {
  const { data, error, isLoading } = useSWR<FunnelsResponse>(
    '/api/launch/funnels',
    fetcher,
    { revalidateOnFocus: false }
  );

  const [showRegister, setShowRegister] = useState(false);
  const [selectedFunnelId, setSelectedFunnelId] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Available funnels for dropdown (only fetched when register form is open)
  const { data: availableData } = useSWR<AvailableFunnelsResponse>(
    showRegister ? '/api/launch/funnels/available' : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Filter out already registered funnels from dropdown
  const registeredIds = new Set((data?.funnels ?? []).map(f => f.id));
  const availableFunnels = (availableData?.funnels ?? []).filter(f => !registeredIds.has(f.id));

  const handleRegister = useCallback(async () => {
    if (!selectedFunnelId) return;
    setRegistering(true);
    setRegisterError('');

    try {
      const res = await fetch('/api/launch/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelId: selectedFunnelId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Registration failed');
      }

      setSelectedFunnelId('');
      setShowRegister(false);
      mutate('/api/launch/funnels');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      setRegisterError(message);
    } finally {
      setRegistering(false);
    }
  }, [selectedFunnelId]);

  const handleRemove = useCallback(async (funnelId: string, name: string) => {
    if (!confirm(`「${name}」を一覧から削除しますか？`)) return;

    try {
      await fetch('/api/launch/funnels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelId }),
      });
      mutate('/api/launch/funnels');
    } catch {
      // ignore
    }
  }, []);

  if (isLoading) return <PageSkeleton sections={2} showFilters={false} />;

  if (error) {
    return (
      <Card>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          データの取得に失敗しました: {error.message}
        </p>
      </Card>
    );
  }

  const funnels = data?.funnels ?? [];

  return (
    <div className="space-y-4">
      {/* Register button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="rounded-[var(--radius-sm)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          {showRegister ? '閉じる' : '+ ローンチを登録'}
        </button>
      </div>

      {/* Register form - dropdown */}
      {showRegister && (
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <label className="text-sm font-medium text-[color:var(--color-text-primary)]">
              ファネルを選択
            </label>
            <div className="flex gap-2">
              <select
                value={selectedFunnelId}
                onChange={(e) => setSelectedFunnelId(e.target.value)}
                className="flex-1 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm bg-white"
              >
                <option value="">-- ファネルを選択してください --</option>
                {availableFunnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRegister}
                disabled={registering || !selectedFunnelId}
                className="rounded-[var(--radius-sm)] bg-[color:var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {registering ? '登録中...' : '登録'}
              </button>
            </div>
            {availableFunnels.length === 0 && availableData && (
              <p className="text-xs text-[color:var(--color-text-muted)]">
                登録可能なファネルがありません（全て登録済みです）
              </p>
            )}
            {registerError && (
              <p className="text-xs text-red-600">{registerError}</p>
            )}
          </div>
        </Card>
      )}

      {/* Funnel cards */}
      {funnels.length === 0 ? (
        <EmptyState
          title="ローンチが登録されていません"
          description="「+ ローンチを登録」ボタンからファネルを選択して計測対象を追加してください。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((funnel) => {
            const status = getFunnelStatus(funnel.startDate, funnel.endDate);
            return (
              <div key={funnel.id} className="relative group">
                <Link href={`/launch/${funnel.id}`} prefetch={false} className="block">
                  <div
                    className={classNames(
                      dashboardCardClass,
                      'flex flex-col gap-3 transition-shadow hover:shadow-md cursor-pointer h-full'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)] leading-snug line-clamp-2">
                        {funnel.name}
                      </h3>
                      <span
                        className={classNames(
                          'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          statusStyles[status]
                        )}
                      >
                        {status}
                      </span>
                    </div>

                    {funnel.description && (
                      <p className="text-xs text-[color:var(--color-text-muted)] line-clamp-2">
                        {funnel.description}
                      </p>
                    )}

                    <div className="text-xs text-[color:var(--color-text-secondary)]">
                      {funnel.startDate || funnel.endDate ? (
                        <span>
                          {formatDate(funnel.startDate)} ~ {formatDate(funnel.endDate)}
                        </span>
                      ) : (
                        <span>期間未設定</span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-muted)] px-2 py-0.5 text-xs text-[color:var(--color-text-secondary)]">
                        配信 {funnel.deliveryCount}件
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleRemove(funnel.id, funnel.name);
                  }}
                  className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-white/80 text-[color:var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors text-xs"
                  title="一覧から削除"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Broadcast Metrics ---------- */

function BroadcastMetrics() {
  const { data, error, isLoading } = useSWR<BroadcastsResponse>(
    '/api/launch/broadcasts',
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <PageSkeleton sections={2} showFilters={false} />;

  if (error) {
    return (
      <Card>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          配信メトリクスの取得に失敗しました: {error.message}
        </p>
      </Card>
    );
  }

  const broadcasts = data?.broadcasts ?? [];

  if (broadcasts.length === 0) {
    return (
      <EmptyState
        title="配信メトリクスがありません"
        description="Lステップの配信メトリクス収集が開始されるとここに表示されます。"
      />
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[color:var(--color-border)]">
              <th className="px-3 py-2 text-xs font-medium text-[color:var(--color-text-secondary)]">配信名</th>
              <th className="px-3 py-2 text-xs font-medium text-[color:var(--color-text-secondary)]">配信日時</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">配信数</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">開封数</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">開封率</th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr key={b.broadcast_id} className="border-b border-[color:var(--color-border)] last:border-b-0">
                <td className="px-3 py-2 text-sm">{b.broadcast_name || b.broadcast_id}</td>
                <td className="px-3 py-2 text-sm text-[color:var(--color-text-secondary)]">{b.sent_at}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums">{formatNumber(b.delivery_count)}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums">{formatNumber(b.open_count)}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums font-medium">{formatPercent(b.open_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
