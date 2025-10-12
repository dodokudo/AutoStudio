import { Card } from '@/components/ui/card';

interface TemplateSummaryItem {
  templateId: string;
  version: number;
  status: string;
  impressionAvg72h?: number;
  likeAvg72h?: number;
  structureNotes?: string;
}

interface TemplateSummaryProps {
  items?: TemplateSummaryItem[];
}

const statusBadge: Record<string, string> = {
  active: 'bg-[#e6f7ed] text-[#096c3e]',
  draft: 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]',
  archived: 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]',
  needs_review: 'bg-[#fff4e5] text-[#ad6800]',
};

export function TemplateSummary({ items }: TemplateSummaryProps) {
  if (!items || !items.length) {
    return null;
  }

  return (
    <Card>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">テンプレート評価</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">投稿後48時間の指標を基にテンプレートの調子を確認できます。</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <article key={item.templateId} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <header className="flex items-center justify-between text-sm">
              <span className="font-medium text-[color:var(--color-text-primary)]">{item.templateId}</span>
              <span className="text-xs text-[color:var(--color-text-muted)]">v{item.version}</span>
            </header>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-[color:var(--color-text-secondary)]">
              <div>
                <dt className="font-medium">平均インプレッション</dt>
                <dd className="mt-1 text-lg font-semibold text-[color:var(--color-text-primary)]">
                  {item.impressionAvg72h ? Math.round(item.impressionAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className="font-medium">平均いいね</dt>
                <dd className="mt-1 text-lg font-semibold text-[color:var(--color-text-primary)]">
                  {item.likeAvg72h ? Math.round(item.likeAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            {item.structureNotes ? (
              <p className="mt-3 text-xs leading-relaxed text-[color:var(--color-text-secondary)]">{item.structureNotes}</p>
            ) : null}
            <span
              className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                statusBadge[item.status] ?? 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]'
              }`}
            >
              状態: {item.status}
            </span>
          </article>
        ))}
      </div>
    </Card>
  );
}
