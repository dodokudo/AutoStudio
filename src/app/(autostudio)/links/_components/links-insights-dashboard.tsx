'use client';

import { useState } from 'react';
import type { LinkInsightItem, LinkInsightsSummary } from '@/lib/links/types';
import { LinkSelectorList } from './link-selector-list';
import { LinkDetailPanel } from './link-detail-panel';

interface LinksInsightsDashboardProps {
  summary: LinkInsightsSummary;
  links: LinkInsightItem[];
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const decimalFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const CATEGORY_LABELS: Record<string, string> = {
  threads: 'Threads',
  instagram: 'Instagram',
  youtube: 'YouTube',
  ad: '広告',
  uncategorized: '未分類',
};

function formatNumber(value: number): string {
  return numberFormatter.format(value ?? 0);
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value ?? 0);
}

function formatCategory(category?: string | null): string {
  if (!category) return '未分類';
  const normalized = category.toLowerCase();
  return CATEGORY_LABELS[normalized] ?? category;
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
      <p className="text-sm font-medium text-[color:var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--color-text-primary)]">
        {value}
      </p>
      {description ? (
        <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function LinksInsightsDashboard({
  summary,
  links,
}: LinksInsightsDashboardProps) {
  const [selectedLink, setSelectedLink] = useState<LinkInsightItem | null>(
    links.length > 0 ? links[0] : null,
  );

  const activeLinkCount = links.filter((link) => link.periodClicks > 0).length;
  const averagePerDay =
    summary.periodDays > 0 ? summary.totalClicks / summary.periodDays : 0;
  const periodLabel = `${summary.periodStart} 〜 ${summary.periodEnd}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">
          リンクインサイト
        </h1>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          対象期間: {periodLabel}
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="期間総クリック数"
          value={formatNumber(summary.totalClicks)}
        />
        <SummaryCard
          label="1日平均クリック"
          value={formatDecimal(averagePerDay)}
          description={`${summary.periodDays}日間の平均値`}
        />
        <SummaryCard
          label="期間内でクリックが発生したリンク"
          value={formatNumber(activeLinkCount)}
          description={`管理リンク数: ${formatNumber(summary.totalLinks)}`}
        />
        <SummaryCard
          label="累計クリック数"
          value={formatNumber(summary.lifetimeClicks)}
        />
      </div>

      {/* カテゴリ別クリック */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
          カテゴリ別クリック（期間内）
        </h2>
        <div className="mt-4 flex flex-wrap gap-4">
          {summary.byCategory.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              期間内のクリックデータがありません。
            </p>
          ) : (
            summary.byCategory.map((item) => (
              <div
                key={item.category}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2"
              >
                <span className="text-sm font-medium text-[color:var(--color-text-primary)]">
                  {formatCategory(item.category)}
                </span>
                <span className="text-lg font-bold text-blue-600">
                  {formatNumber(item.clicks)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* リンク一覧 + 詳細パネル */}
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* 左: リンク一覧 */}
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
            リンク一覧
          </h2>
          <div className="max-h-[480px] overflow-y-auto">
            <LinkSelectorList
              links={links}
              selectedId={selectedLink?.id ?? null}
              onSelect={setSelectedLink}
            />
          </div>
        </div>

        {/* 右: 選択リンクの詳細 */}
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          {selectedLink ? (
            <LinkDetailPanel
              link={selectedLink}
              startDate={summary.periodStart}
              endDate={summary.periodEnd}
            />
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-[color:var(--color-text-secondary)]">
              左のリンク一覧から選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
