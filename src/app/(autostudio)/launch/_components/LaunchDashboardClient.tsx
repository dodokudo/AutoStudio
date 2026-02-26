'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Table } from '@/components/ui/table';
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
  return `${(value * 100).toFixed(1)}%`;
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

/* ---------- Funnel List ---------- */

function FunnelList() {
  const { data, error, isLoading } = useSWR<FunnelsResponse>(
    '/api/launch/funnels',
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return <PageSkeleton sections={3} showFilters={false} />;

  if (error) {
    return (
      <Card>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          ファネルデータの取得に失敗しました: {error.message}
        </p>
      </Card>
    );
  }

  const funnels = data?.funnels ?? [];

  if (funnels.length === 0) {
    return (
      <EmptyState
        title="ローンチデータがありません"
        description="marketing.funnels テーブルにデータが存在しないか、すべてテンプレートです。"
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {funnels.map((funnel) => {
        const status = getFunnelStatus(funnel.startDate, funnel.endDate);
        return (
          <Link key={funnel.id} href={`/launch/${funnel.id}`} className="block">
            <div
              className={classNames(
                dashboardCardClass,
                'flex flex-col gap-3 transition-shadow hover:shadow-md cursor-pointer h-full'
              )}
            >
              {/* Header */}
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

              {/* Description */}
              {funnel.description && (
                <p className="text-xs text-[color:var(--color-text-muted)] line-clamp-2">
                  {funnel.description}
                </p>
              )}

              {/* Date range */}
              <div className="text-xs text-[color:var(--color-text-secondary)]">
                {funnel.startDate || funnel.endDate ? (
                  <span>
                    {formatDate(funnel.startDate)} ~ {formatDate(funnel.endDate)}
                  </span>
                ) : (
                  <span>期間未設定</span>
                )}
              </div>

              {/* Badges */}
              <div className="mt-auto flex items-center gap-2 pt-1">
                <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-muted)] px-2 py-0.5 text-xs text-[color:var(--color-text-secondary)]">
                  配信 {funnel.deliveryCount}件
                </span>
                {funnel.segmentCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-muted)] px-2 py-0.5 text-xs text-[color:var(--color-text-secondary)]">
                    セグメント {funnel.segmentCount}
                  </span>
                )}
              </div>

              {/* Updated */}
              <p className="text-[10px] text-[color:var(--color-text-muted)]">
                更新: {formatDate(funnel.updatedAt)}
              </p>
            </div>
          </Link>
        );
      })}
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
        description="broadcast_metrics テーブルにデータが存在しません。Lステップのデータ収集バッチが実行された後に表示されます。"
      />
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                配信名
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                配信日時
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">
                配信数
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">
                開封数
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">
                開封率
              </th>
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => (
              <tr
                key={b.broadcast_id}
                className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-surface-muted)] transition-colors"
              >
                <td className="px-3 py-2 text-sm text-[color:var(--color-text-primary)]">
                  {b.broadcast_name || b.broadcast_id}
                </td>
                <td className="px-3 py-2 text-sm text-[color:var(--color-text-secondary)]">
                  {formatDate(b.sent_at)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">
                  {formatNumber(b.delivery_count)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">
                  {formatNumber(b.open_count)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums font-medium text-[color:var(--color-text-primary)]">
                  {formatPercent(b.open_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
