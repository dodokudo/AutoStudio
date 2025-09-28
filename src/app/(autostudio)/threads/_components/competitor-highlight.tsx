import { Card } from '@/components/ui/card';

interface Highlight {
  accountName: string;
  username?: string | null;
  impressions?: string;
  likes?: string;
  summary: string;
  categories?: string[];
}

interface CompetitorHighlightProps {
  items: Highlight[];
}

export function CompetitorHighlights({ items }: CompetitorHighlightProps) {
  return (
    <Card>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合ハイライト</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近7日で反応の高かった投稿を要約しています。</p>
      </header>
      <div className="grid gap-4">
        {items.map((item) => (
          <article key={item.accountName} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{item.accountName}</p>
                {item.username ? (
                  <p className="text-xs text-[color:var(--color-text-muted)]">@{item.username}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                {item.impressions ? <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5">Imp {item.impressions}</span> : null}
                {item.likes ? <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5">Like {item.likes}</span> : null}
              </div>
            </header>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">{item.summary}</p>
            {item.categories && item.categories.length ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--color-text-muted)]">
                {item.categories.map((category, index) => (
                  <li key={`${category}-${index}`} className="rounded-full bg-[#f2f4f7] px-2.5 py-0.5">
                    {category}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </Card>
  );
}
