import { Card } from '@/components/ui/card';

interface TopContentCardProps {
  posts: Array<{
    id: string;
    content: string;
    views: number;
    likes: number;
    replies: number;
    postedAt: string;
  }>;
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  if (Number.isNaN(diffInMs) || diffInMs < 0) {
    return '日時未取得';
  }
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  if (diffInHours < 24) return `${diffInHours}時間前`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}日前`;
  return `${Math.floor(diffInDays / 7)}週間前`;
}

function truncateText(text: string, maxLength = 80) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function TopContentCard({ posts }: TopContentCardProps) {
  return (
    <Card>
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">トップコンテンツ</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">選択期間内で反応が高かった投稿を表示しています。</p>
      </header>
      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5 text-center text-sm text-[color:var(--color-text-muted)]">
            データがありません。
          </p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                <span>{formatTimeAgo(post.postedAt)}</span>
                <div className="flex items-center gap-3">
                  <span>閲覧 {post.views.toLocaleString()}</span>
                  <span>いいね {post.likes.toLocaleString()}</span>
                  <span>返信 {post.replies.toLocaleString()}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-[color:var(--color-text-primary)]">{truncateText(post.content)}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
