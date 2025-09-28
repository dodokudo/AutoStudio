import type { CompetitorProfile } from '@/lib/instagram/competitors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface Props {
  competitors: CompetitorProfile[];
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}

export function CompetitorManager({ competitors, addAction, removeAction }: Props) {
  return (
    <Card className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合アカウントの管理</h2>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          追加した競合は次回のインサイト同期で自動的に測定対象になります。
        </p>
      </header>

      <form action={addAction} className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-sm">
        <div className="grid gap-1">
          <label htmlFor="username" className="text-xs font-medium text-[color:var(--color-text-muted)]">
            Instagram ユーザー名（@なし）
          </label>
          <input
            id="username"
            name="username"
            required
            className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            placeholder="example_account"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="driveFolderId" className="text-xs font-medium text-[color:var(--color-text-muted)]">
            Drive フォルダID（任意）
          </label>
          <input
            id="driveFolderId"
            name="driveFolderId"
            className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            placeholder="1abc..."
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="category" className="text-xs font-medium text-[color:var(--color-text-muted)]">
            カテゴリ（任意）
          </label>
          <input
            id="category"
            name="category"
            className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            placeholder="AI / SNS運用 など"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="priority" className="text-xs font-medium text-[color:var(--color-text-muted)]">
            優先度（数値・小さいほど先に処理）
          </label>
          <input
            id="priority"
            name="priority"
            type="number"
            min="0"
            className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            placeholder="100"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit">競合を追加</Button>
        </div>
      </form>

      <section className="space-y-3 text-sm text-[color:var(--color-text-secondary)]">
        <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">登録済みの競合</h3>
        {competitors.length ? (
          <ul className="space-y-2">
            {competitors.map((item) => (
              <li
                key={item.username}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2"
              >
                <div>
                  <p className="font-medium text-[color:var(--color-text-primary)]">@{item.username}</p>
                  <p className="text-xs text-[color:var(--color-text-muted)]">
                    {item.category ? `${item.category} / ` : ''}優先度 {item.priority}
                    {item.driveFolderId ? ` / Drive: ${item.driveFolderId}` : ''}
                  </p>
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="username" value={item.username} />
                  <Button variant="secondary" className="text-xs" type="submit">
                    無効化
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="登録済みの競合がありません" description="上のフォームから競合アカウントを追加してください。" />
        )}
      </section>
    </Card>
  );
}
