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

export function TopContentCard({ posts }: TopContentCardProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);

    if (Number.isNaN(diffInHours)) {
      return '日時未取得';
    }

    if (diffInHours < 24) {
      return `${diffInHours}時間前`;
    } else if (diffInDays < 7) {
      return `${diffInDays}日前`;
    } else {
      return `${diffInWeeks}週間前`;
    }
  };

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
        <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]">
            🏆
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            トップコンテンツ
          </h3>
        </div>

        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <div className="rounded-3xl border border-white/40 bg-white/70 p-8 backdrop-blur-sm">
                コンテンツがありません
              </div>
            </div>
          ) : (
            posts.slice(0, 5).map((post) => (
              <div
                key={post.id}
                className="rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm hover:shadow-[0_20px_40px_rgba(110,132,206,0.25)] transition-all duration-300 dark:border-white/20 dark:bg-white/10"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-6 text-sm">
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">👁️</span>
                      <span className="font-semibold">{post.views.toLocaleString()}</span>
                    </span>
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-pink-100 dark:bg-pink-500/20">💖</span>
                      <span className="font-semibold">{post.likes}</span>
                    </span>
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">💬</span>
                      <span className="font-semibold">{post.replies}</span>
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-3 py-1 rounded-full bg-slate-100/60 dark:bg-slate-800/40">
                    {formatTimeAgo(post.postedAt)}
                  </span>
                </div>

                <p className="text-slate-900 dark:text-white font-medium leading-relaxed">
                  {truncateText(post.content)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
