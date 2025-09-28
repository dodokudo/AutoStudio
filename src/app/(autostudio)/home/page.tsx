export default function HomePage() {
  return (
    <div className="section-stack">
      <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
          <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
        </div>

        <div className="relative text-center">
          <div className="flex h-20 w-20 mx-auto mb-6 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]">
            🏠
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
            AutoStudio
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
            自動投稿システムへようこそ。各プラットフォームの管理を開始しましょう。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <a
              href="/threads"
              className="group rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm hover:shadow-[0_20px_40px_rgba(110,132,206,0.25)] transition-all duration-300 dark:border-white/20 dark:bg-white/10"
            >
              <div className="flex h-12 w-12 mx-auto mb-4 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)] group-hover:scale-110 transition-transform">
                🧵
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Threads</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">投稿管理とインサイト分析</p>
            </a>

            <a
              href="/instagram"
              className="group rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm hover:shadow-[0_20px_40px_rgba(110,132,206,0.25)] transition-all duration-300 dark:border-white/20 dark:bg-white/10"
            >
              <div className="flex h-12 w-12 mx-auto mb-4 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(236,72,153,0.25)] group-hover:scale-110 transition-transform">
                📸
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Instagram</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">フィード・ストーリー管理</p>
            </a>

            <a
              href="/youtube"
              className="group rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm hover:shadow-[0_20px_40px_rgba(110,132,206,0.25)] transition-all duration-300 dark:border-white/20 dark:bg-white/10"
            >
              <div className="flex h-12 w-12 mx-auto mb-4 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-pink-600 text-white shadow-[0_10px_20px_rgba(239,68,68,0.25)] group-hover:scale-110 transition-transform">
                🎥
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">YouTube</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">動画・台本作成</p>
            </a>

            <a
              href="/line"
              className="group rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm hover:shadow-[0_20px_40px_rgba(110,132,206,0.25)] transition-all duration-300 dark:border-white/20 dark:bg-white/10"
            >
              <div className="flex h-12 w-12 mx-auto mb-4 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-[0_10px_20px_rgba(34,197,94,0.25)] group-hover:scale-110 transition-transform">
                💬
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">LINE</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">メッセージ配信管理</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}