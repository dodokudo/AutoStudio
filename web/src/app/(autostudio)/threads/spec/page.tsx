import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Threads MVP Spec | AutoStudio',
};

const sections = [
  {
    title: 'データモデル',
    description: 'Threads / Threads post シートをBigQueryへ同期し、72時間の閲覧推移で評価する指標設計。',
  },
  {
    title: '生成フロー',
    description: 'Claudeに渡す入力テンプレと、ハウツー系投稿を10本生成するための出力スキーマ。',
  },
  {
    title: '承認・投稿',
    description: 'AutoStudioダッシュボードのUI構成と、Threads APIを使った予約投稿シーケンス。',
  },
  {
    title: '競合分析',
    description: '秘書シートからの取り込み、構成タグ付与、テンプレ改善への反映ルール。',
  },
];

export default function ThreadsSpecPage() {
  return (
    <div className="space-y-8 text-sm text-slate-300">
      <h1 className="text-3xl font-semibold text-white">Threads MVP 詳細仕様</h1>
      <p>
        最新の仕様はリポジトリ内の
        <code className="mx-1 rounded bg-slate-800 px-2 py-1 text-xs">docs/threads-mvp-spec.md</code>
        に保管しています。更新があればマーケサイドと合意したうえでドキュメントと実装を同期させてください。
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg"
          >
            <h2 className="text-lg font-medium text-white">{section.title}</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{section.description}</p>
          </article>
        ))}
      </div>

      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-100">
        <h2 className="text-lg font-semibold">進め方メモ</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-amber-50/90">
          <li>仕様変更時は <code>docs/threads-mvp-spec.md</code> を更新し、Pull Requestで共有。</li>
          <li>Claude Code / Codexで実装する際は最新仕様の確認と差分ログを必ず残す。</li>
          <li>BigQueryスキーマ変更にはマイグレーション手順を添付する。</li>
        </ul>
      </section>
    </div>
  );
}
