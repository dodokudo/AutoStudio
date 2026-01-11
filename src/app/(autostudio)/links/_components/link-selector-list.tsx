'use client';

import type { LinkInsightItem } from '@/lib/links/types';

interface LinkSelectorListProps {
  links: LinkInsightItem[];
  selectedId: string | null;
  onSelect: (link: LinkInsightItem) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  threads: 'Threads',
  instagram: 'Instagram',
  youtube: 'YouTube',
  ad: '広告',
  uncategorized: '未分類',
};

function formatCategory(category?: string | null): string {
  if (!category) return '未分類';
  const normalized = category.toLowerCase();
  return CATEGORY_LABELS[normalized] ?? category;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value ?? 0);
}

export function LinkSelectorList({ links, selectedId, onSelect }: LinkSelectorListProps) {
  // クリック数が0より大きいリンクのみ表示（オプションでフィルター解除可能）
  const sortedLinks = [...links].sort((a, b) => b.periodClicks - a.periodClicks);

  return (
    <div className="space-y-1">
      {sortedLinks.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--color-text-secondary)]">
          リンクがありません
        </p>
      ) : (
        sortedLinks.map((link) => {
          const isSelected = link.id === selectedId;
          return (
            <button
              key={link.id}
              type="button"
              onClick={() => onSelect(link)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-[color:var(--color-border)] bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      isSelected
                        ? 'text-blue-700'
                        : 'text-[color:var(--color-text-primary)]'
                    }`}
                  >
                    {link.managementName || link.shortCode}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">
                    {formatCategory(link.category)}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold ${
                      isSelected
                        ? 'text-blue-700'
                        : 'text-[color:var(--color-text-primary)]'
                    }`}
                  >
                    {formatNumber(link.periodClicks)}
                  </p>
                  <p className="text-xs text-[color:var(--color-text-muted)]">クリック</p>
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
