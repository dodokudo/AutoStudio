import Link from 'next/link';

const upcomingSections = [
  {
    title: 'Data Sync',
    description:
      'Import Threads日次インサイトと投稿データをBigQueryに同期し、閲覧数ベースの評価を自動化します。',
  },
  {
    title: 'AI Generation',
    description:
      'Claudeを使ってハウツー系の投稿案を10本生成。テンプレート学習と競合ハイライトを組み合わせて品質を維持します。',
  },
  {
    title: 'Approval & Scheduling',
    description:
      'AutoStudioのUI上で承認・編集・予約。Threads APIでメイン投稿とコメントツリーを自動投稿します。',
  },
  {
    title: 'Competitor Insights',
    description:
      '秘書が記録した競合シートを取り込み、テーマ・構成タグを自動抽出。自社テンプレ改善に反映します。',
  },
];

export default function ThreadsHome() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="text-3xl font-semibold text-white">Threads Automation MVP</h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
          AutoStudioの最初のモジュールとして、Threads投稿の生成から承認・自動投稿までを一気通貫で支援するツールを構築します。
          現在はアーキテクチャのセットアップ段階で、仕様の詳細は
          <Link
            href="/threads/spec"
            className="ml-1 underline decoration-slate-500 underline-offset-4 hover:text-white"
          >
            ドキュメント
          </Link>
          を参照してください。
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {upcomingSections.map((section) => (
          <div
            key={section.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-200 shadow-lg"
          >
            <h2 className="text-lg font-medium text-white">{section.title}</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{section.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
        <h2 className="text-lg font-medium text-white">開発ステータス</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <li>Next.js + Tailwindのベースプロジェクトを初期化済み</li>
          <li>仕様書を <code>docs/threads-mvp-spec.md</code> に格納</li>
          <li>API・データ同期・UI作成はこれから実装予定</li>
        </ul>
      </section>
    </div>
  );
}
