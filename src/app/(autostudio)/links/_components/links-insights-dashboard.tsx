'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { LinkInsightItem, LinkInsightsSummary } from '@/lib/links/types';
import { LinkDailyChart } from './link-daily-chart';

interface LinksInsightsDashboardProps {
  summary: LinkInsightsSummary;
  links: LinkInsightItem[];
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const decimalFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

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
  if (!category) {
    return '未分類';
  }
  const normalized = category.toLowerCase();
  return CATEGORY_LABELS[normalized] ?? category;
}

function SummaryCard({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
      <p className="text-sm font-medium text-[color:var(--color-text-secondary)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--color-text-primary)]">{value}</p>
      {description ? (
        <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

export function LinksInsightsDashboard({ summary, links }: LinksInsightsDashboardProps) {
  const [selectedLink, setSelectedLink] = useState<LinkInsightItem | null>(null);

  const activeLinkCount = links.filter((link) => link.periodClicks > 0).length;
  const averagePerDay = summary.periodDays > 0 ? summary.totalClicks / summary.periodDays : 0;
  const periodLabel = `${summary.periodStart} 〜 ${summary.periodEnd}`;

  // クリック数でソート
  const sortedLinks = [...links].sort((a, b) => b.periodClicks - a.periodClicks);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンクインサイト</h1>
        <p className="text-sm text-[color:var(--color-text-secondary)]">対象期間: {periodLabel}</p>
      </div>

      {/* KPIカード */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="期間総クリック数" value={formatNumber(summary.totalClicks)} />
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
        <SummaryCard label="累計クリック数" value={formatNumber(summary.lifetimeClicks)} />
      </div>

      {/* カテゴリ別クリック */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">カテゴリ別クリック（期間内）</h2>
        <div className="mt-4 flex flex-wrap gap-4">
          {summary.byCategory.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-secondary)]">期間内のクリックデータがありません。</p>
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

      {/* リンク一覧（コンパクト） */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
          リンク一覧（クリックで日別推移を表示）
        </h2>
        <div className="max-h-[400px] overflow-y-auto">
          <div className="space-y-1">
            {sortedLinks.length === 0 ? (
              <p className="py-4 text-center text-sm text-[color:var(--color-text-secondary)]">
                リンクがありません
              </p>
            ) : (
              sortedLinks.map((link) => {
                const isSelected = selectedLink?.id === link.id;
                return (
                  <div
                    key={link.id}
                    onClick={() => setSelectedLink(isSelected ? null : link)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-[color:var(--color-border)] bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-medium ${
                            isSelected ? 'text-blue-700' : 'text-[color:var(--color-text-primary)]'
                          }`}
                        >
                          {link.managementName || link.shortCode}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {formatCategory(link.category)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-[color:var(--color-text-muted)]">
                        {link.destinationUrl}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-4">
                      <div className="text-right">
                        <p
                          className={`text-lg font-bold ${
                            isSelected ? 'text-blue-700' : 'text-[color:var(--color-text-primary)]'
                          }`}
                        >
                          {formatNumber(link.periodClicks)}
                        </p>
                        <p className="text-xs text-[color:var(--color-text-muted)]">クリック</p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Link
                          href={`/links/${link.id}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          詳細
                        </Link>
                        <Link
                          href={`/links/${link.id}/edit`}
                          className="text-gray-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          編集
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 選択したリンクの日別推移グラフ */}
      {selectedLink && (
        <LinkDailyChart
          link={selectedLink}
          startDate={summary.periodStart}
          endDate={summary.periodEnd}
        />
      )}
    </div>
  );
}
