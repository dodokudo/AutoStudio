import { Card } from '@/components/ui/card';

type SortOption = 'postedAt' | 'views' | 'likes';

interface TopContentCardProps {
  posts: Array<{
    id: string;
    content: string;
    views: number;
    likes: number;
    replies: number;
    postedAt: string;
  }>;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}



function truncateText(text: string, maxLength = 80) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function TopContentCard({ posts, sortOption, onSortChange }: TopContentCardProps) {
  return (
    <Card>
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">トップコンテンツ</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">選択期間内で反応が高かった投稿を表示しています。</p>
        </div>
        <select
          value={sortOption}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
        >
          <option value="views">閲覧数</option>
          <option value="likes">いいね数</option>
          <option value="postedAt">投稿日</option>
        </select>
      </header>
      <div className="space-y-2">
        {posts.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5 text-center text-sm text-[color:var(--color-text-muted)]">
            データがありません。
          </p>
        ) : (
          posts.map((post) => (
            <details
              key={post.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)]"
            >
              <summary className="flex cursor-pointer flex-col gap-1 text-left">
                <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                  <span>{new Date(post.postedAt).toLocaleString('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}</span>
                  <div className="flex items-center gap-3">
                    <span>閲覧 {post.views.toLocaleString()}</span>
                    <span>いいね {post.likes.toLocaleString()}</span>
                    <span>返信 {post.replies.toLocaleString()}</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-[color:var(--color-text-primary)]">
                  {truncateText(post.content)}
                </p>
              </summary>
              <div className="mt-2 border-t border-[color:var(--color-border)] pt-2 text-sm text-[color:var(--color-text-secondary)] whitespace-pre-wrap">
                {post.content}
              </div>
            </details>
          ))
        )}
      </div>
    </Card>
  );
}
