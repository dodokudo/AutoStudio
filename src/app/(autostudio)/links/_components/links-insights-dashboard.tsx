import Link from 'next/link';
import type { LinkInsightItem, LinkInsightsSummary } from '@/lib/links/types';

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

function formatDateJapan(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function formatTimestampJapan(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const activeLinkCount = links.filter((link) => link.periodClicks > 0).length;
  const averagePerDay = summary.periodDays > 0 ? summary.totalClicks / summary.periodDays : 0;
  const periodLabel = `${summary.periodStart} 〜 ${summary.periodEnd}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンクインサイト</h1>
        <p className="text-sm text-[color:var(--color-text-secondary)]">対象期間: {periodLabel}</p>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[2fr,3fr]">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">カテゴリ別クリック（期間内）</h2>
          <div className="mt-4 space-y-2">
            {summary.byCategory.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-secondary)]">期間内のクリックデータがありません。</p>
            ) : (
              summary.byCategory.map((item) => (
                <div key={item.category} className="flex items-center justify-between">
                  <span className="text-sm text-[color:var(--color-text-primary)]">{formatCategory(item.category)}</span>
                  <span className="text-sm font-medium text-[color:var(--color-text-secondary)]">
                    {formatNumber(item.clicks)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">期間の概要</h2>
          <dl className="mt-4 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-[color:var(--color-text-primary)]">期間</dt>
              <dd>{periodLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-[color:var(--color-text-primary)]">対象日数</dt>
              <dd>{formatNumber(summary.periodDays)} 日</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-[color:var(--color-text-primary)]">管理リンク数</dt>
              <dd>{formatNumber(summary.totalLinks)} 件</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium text-[color:var(--color-text-primary)]">期間内にクリックがあったリンク</dt>
              <dd>{formatNumber(activeLinkCount)} 件</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  管理名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  カテゴリ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  短縮リンク
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  期間クリック
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  累計クリック
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  最終クリック時刻
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  作成日
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {links.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-[color:var(--color-text-secondary)]">
                    表示できるリンクがありません。
                  </td>
                </tr>
              ) : (
                links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[color:var(--color-text-primary)]">
                          {link.managementName || '-'}
                        </span>
                        <span className="text-xs text-[color:var(--color-text-secondary)]">{link.shortCode}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {formatCategory(link.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/l/${link.shortCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-[320px] truncate text-sm text-blue-600 hover:underline"
                        title={link.destinationUrl}
                      >
                        {link.destinationUrl}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-[color:var(--color-text-primary)]">
                      {formatNumber(link.periodClicks)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-[color:var(--color-text-secondary)]">
                      {formatNumber(link.lifetimeClicks)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-[color:var(--color-text-secondary)]">
                      {formatTimestampJapan(link.lastClickedAt)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-[color:var(--color-text-secondary)]">
                      {formatDateJapan(link.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-3 text-sm">
                        <Link href={`/links/${link.id}`} className="text-blue-600 hover:underline">
                          詳細
                        </Link>
                        <Link href={`/links/${link.id}/edit`} className="text-gray-600 hover:underline">
                          編集
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
