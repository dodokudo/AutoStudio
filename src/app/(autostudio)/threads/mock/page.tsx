'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AccountInsightsCard } from '../_components/account-insights-card';
import { TopContentCard } from '../_components/top-content-card';
import { TemplateSummary } from '../_components/template-summary';
import { CompetitorHighlights } from '../_components/competitor-highlight';

type TabKey = 'postInsights' | 'competitorInsights';

const ACCOUNT_OVERVIEW_METRICS = [
  { label: '本日の投稿予定', value: '3件', note: '午前2件 / 夕方1件' },
  { label: '承認待ち', value: '5件', note: 'レビュー担当: 佐藤' },
  { label: '下書き', value: '12件', note: '優先度: Hook強化' },
];

const POST_IDEA_ITEMS = [
  {
    theme: 'AI活用による業務効率化',
    hook: '【保存版】AIで月30時間削減したワークフロー公開',
  },
  {
    theme: 'CTA最適化の研究ログ',
    hook: 'CTAの言い回しを3パターン検証した結果',
  },
  {
    theme: 'フォロワー伸長の裏側',
    hook: 'フォロワーが1週間で+420増えた配信設計',
  },
];

const POSTED_CONTENT_SAMPLE = [
  {
    id: 'p-001',
    caption: 'AIで月30時間削減。忙しいチームが実践したシンプルな自動化フロー。',
    postedAt: '2024-09-10 07:30',
    impressions: 12480,
    likes: 980,
  },
  {
    id: 'p-002',
    caption: 'CTA比較テストで分かった、保存率を2倍にしたテキスト構成。',
    postedAt: '2024-09-09 18:45',
    impressions: 9800,
    likes: 720,
  },
  {
    id: 'p-003',
    caption: '3日でフォロワー+210。Threads投稿の導線を再設計した手順。',
    postedAt: '2024-09-08 20:10',
    impressions: 8450,
    likes: 630,
  },
];

const ACCOUNT_INSIGHTS_MOCK = {
  posts: 12,
  views: 48230,
  likes: 3680,
  newFollowers: 420,
  previousPosts: 9,
  previousViews: 39120,
  previousLikes: 2980,
  previousNewFollowers: 310,
};

const TOP_CONTENT_SAMPLE = [
  {
    id: 't-001',
    content: `AIで月30時間削減。音声入力と自動化ワークフローで成果を最大化したプロセスを公開します。

① 課題の棚卸し
② 自動化の設計
③ 定量評価の方法`,
    views: 12480,
    likes: 980,
    replies: 62,
    postedAt: '2024-09-10T07:15:00Z',
  },
  {
    id: 't-002',
    content:
      'CTAの言い回しで保存率が2倍になった理由。ファネル別にどのワードが効いたのかを整理しました。',
    views: 9860,
    likes: 740,
    replies: 41,
    postedAt: '2024-09-09T18:30:00Z',
  },
  {
    id: 't-003',
    content: 'フォロワーが3日で+210。投稿時間と導線を再設計したメモを公開します。',
    views: 8420,
    likes: 630,
    replies: 29,
    postedAt: '2024-09-08T20:05:00Z',
  },
];

const TEMPLATE_SUMMARY_SAMPLE = [
  {
    templateId: 'hook_negate_v3',
    version: 3,
    status: 'needs_review',
    impressionAvg72h: 1159,
    likeAvg72h: 6,
    structureNotes: 'Hookの課題提起は強いが、事例導入で離脱が発生。ミドルパートの圧縮を検討。',
  },
  {
    templateId: 'secret_technique',
    version: 2,
    status: 'active',
    impressionAvg72h: 1890,
    likeAvg72h: 48,
    structureNotes: 'How-to分解が好評。CTAをコミュニティ案内に差し替えた結果が安定。',
  },
  {
    templateId: 'prompt_case_study',
    version: 1,
    status: 'draft',
    impressionAvg72h: 920,
    likeAvg72h: 21,
    structureNotes: 'ケーススタディの冒頭に成果数字を置くと反応が向上。導入部のABテスト継続。',
  },
];

const COMPETITOR_PROFILES = [
  {
    id: 'comp-01',
    displayName: 'Marketing Pro Lab',
    username: 'marketing_pro',
    followers: '18.4K',
    avgEngagement: '2.8%',
    highlight: {
      accountName: 'Marketing Pro Lab',
      username: 'marketing_pro',
      impressions: '14,200',
      likes: '2,360',
      summary:
        '採用の舞台裏をストーリー形式で公開し、CTAで無料相談へ誘導。Hook→ストーリー→CTAの構成が高反応。',
      categories: ['保存率↑', 'CTA最適化'],
    },
    posts: [
      {
        id: 'comp-01-01',
        postedAt: '2024-09-10 09:10',
        title: 'コミュニティ立ち上げの失敗談から逆算した、伸びる導線設計',
        impressions: 14200,
        likes: 2360,
      },
      {
        id: 'comp-01-02',
        postedAt: '2024-09-08 20:45',
        title: 'フォロワーが買うCTAの作り方。3つのキーワードで解説',
        impressions: 11840,
        likes: 1890,
      },
    ],
  },
  {
    id: 'comp-02',
    displayName: 'Growth Studio',
    username: 'growth_studio',
    followers: '12.9K',
    avgEngagement: '3.2%',
    highlight: {
      accountName: 'Growth Studio',
      username: 'growth_studio',
      impressions: '11,860',
      likes: '1,780',
      summary:
        'バズった要因を3つの見出しで整理。Hook→Insight→CTAの流れで強い保存率を獲得。',
      categories: ['インサイト', '導線設計'],
    },
    posts: [
      {
        id: 'comp-02-01',
        postedAt: '2024-09-11 07:20',
        title: '保存率が2.1倍。キャプションの語尾を変えただけの話',
        impressions: 11860,
        likes: 1780,
      },
      {
        id: 'comp-02-02',
        postedAt: '2024-09-09 19:05',
        title: 'Threads運用の勝ちパターン。導入→疑問→答え→CTAの分解メモ',
        impressions: 9860,
        likes: 1450,
      },
    ],
  },
  {
    id: 'comp-03',
    displayName: 'Startup Lab',
    username: 'startup_lab',
    followers: '21.2K',
    avgEngagement: '2.1%',
    highlight: {
      accountName: 'Startup Lab',
      username: 'startup_lab',
      impressions: '9,640',
      likes: '1,120',
      summary:
        'プロダクト開発の裏側をストーリー化。疑問投げかけ → データ → CTAでコメント数が増加。',
      categories: ['事例紹介', 'コメント誘導'],
    },
    posts: [
      {
        id: 'comp-03-01',
        postedAt: '2024-09-10 12:30',
        title: '開発ロードマップ公開。ユーザー起点の優先順位付け',
        impressions: 9640,
        likes: 1120,
      },
      {
        id: 'comp-03-02',
        postedAt: '2024-09-07 21:15',
        title: 'ベータユーザー100名を集めたテスト設計',
        impressions: 8620,
        likes: 980,
      },
    ],
  },
];

export default function ThreadsUiRefreshMock() {
  const [activeTab, setActiveTab] = useState<TabKey>('postInsights');
  const [topContentSort, setTopContentSort] = useState<'postedAt' | 'views' | 'likes'>('views');
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string>(COMPETITOR_PROFILES[0].id);

  const activeCompetitor = useMemo(
    () => COMPETITOR_PROFILES.find((profile) => profile.id === selectedCompetitorId) ?? COMPETITOR_PROFILES[0],
    [selectedCompetitorId],
  );

  return (
    <div className="section-stack">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">Threads UI Refresh Mock</h1>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          投稿インサイトと競合インサイトの2軸で構成する新レイアウトのたたき台です。
        </p>
      </header>

      <nav className="flex overflow-x-auto border-b border-[color:var(--color-border)] scrollbar-hide">
        <button
          type="button"
          onClick={() => setActiveTab('postInsights')}
          className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'postInsights'
              ? 'border-b-2 border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
              : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
          }`}
        >
          投稿インサイト
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('competitorInsights')}
          className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'competitorInsights'
              ? 'border-b-2 border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
              : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
          }`}
        >
          競合インサイト
        </button>
      </nav>

      {activeTab === 'postInsights' ? (
        <div className="section-stack">
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <header className="mb-4">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">アカウントの概要</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">投稿前に主要メトリクスとタスクを確認します。</p>
              </header>
              <div className="grid gap-3 sm:grid-cols-3">
                {ACCOUNT_OVERVIEW_METRICS.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)]"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-[color:var(--color-text-primary)]">{metric.value}</p>
                    <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{metric.note}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <header className="mb-4">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">個別投稿作成</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                  アイデアを下書き化してレビューに回すフォームを想定したモックです。
                </p>
              </header>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="投稿タイトル / Hook"
                  className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                />
                <textarea
                  rows={6}
                  placeholder="本文 (各段落を改行で区切り、CTAも記載)"
                  className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focusリング[color:var(--color-accent)]"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">
                    <span>テンプレート</span>
                    <select className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]">
                      <option>hook_negate_v3</option>
                      <option>secret_technique</option>
                      <option>prompt_case_study</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:opacity-90"
                  >
                    下書きとして保存
                  </button>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">今日の投稿案</h2>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                    トレンドと過去実績から抽出した候補です。採用する案を選択して編集に進みます。
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
                >
                  刷新
                </button>
              </header>
              <div className="grid gap-3 md:grid-cols-3">
                {POST_IDEA_ITEMS.map((item) => (
                  <article
                    key={item.hook}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]"
                  >
                    <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{item.theme}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">{item.hook}</p>
                    <button
                      type="button"
                      className="mt-4 inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
                    >
                      編集に追加
                    </button>
                  </article>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <header className="mb-4">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">投稿済みのコンテンツ</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近の公開投稿と主要指標を確認します。</p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
                      <th className="border-b border-[color:var(--color-border)] pb-2 pr-4 font-medium">投稿日</th>
                      <th className="border-b border-[color:var(--color-border)] pb-2 pr-4 font-medium">メインテキスト</th>
                      <th className="border-b border-[color:var(--color-border)] pb-2 pr-4 font-medium text-right">Imp</th>
                      <th className="border-b border-[color:var(--color-border)] pb-2 text-right font-medium">Like</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POSTED_CONTENT_SAMPLE.map((post) => (
                      <tr key={post.id} className="border-b border-[color:var(--color-border)] last:border-b-0">
                        <td className="py-3 pr-4 text-xs text-[color:var(--color-text-muted)]">{post.postedAt}</td>
                        <td className="py-3 pr-4 text-sm text-[color:var(--color-text-primary)]">{post.caption}</td>
                        <td className="py-3 pr-4 text-right text-sm text-[color:var(--color-text-primary)]">
                          {post.impressions.toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-sm text-[color:var(--color-text-primary)]">
                          {post.likes.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section className="section-stack">
            <AccountInsightsCard data={ACCOUNT_INSIGHTS_MOCK} note="レポート期間: 直近7日間 (モック)" />
            <TopContentCard posts={TOP_CONTENT_SAMPLE} sortOption={topContentSort} onSortChange={setTopContentSort} />
            <TemplateSummary items={TEMPLATE_SUMMARY_SAMPLE} />
          </section>
        </div>
      ) : (
        <div className="section-stack">
          <section className="space-y-4">
            <Card>
              <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合アカウントを比較</h2>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                    主要な競合アカウントのパフォーマンスと投稿内容を切り替えて確認します。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {COMPETITOR_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedCompetitorId(profile.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        profile.id === activeCompetitor.id
                          ? 'bg-[color:var(--color-accent)] text-white shadow-[var(--shadow-soft)]'
                          : 'border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                      }`}
                    >
                      {profile.displayName}
                    </button>
                  ))}
                </div>
              </header>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">アカウント</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--color-text-primary)]">{activeCompetitor.displayName}</p>
                  <p className="text-xs text-[color:var(--color-text-secondary)]">@{activeCompetitor.username}</p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">フォロワー</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--color-text-primary)]">{activeCompetitor.followers}</p>
                  <p className="text-xs text-[color:var(--color-text-secondary)]">推定値 / Threads公開情報</p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">平均エンゲージ</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--color-text-primary)]">{activeCompetitor.avgEngagement}</p>
                  <p className="text-xs text-[color:var(--color-text-secondary)]">直近7日間 (推定)</p>
                </div>
              </div>
            </Card>

            <CompetitorHighlights items={COMPETITOR_PROFILES.map((profile) => profile.highlight)} />

            <Card>
              <header className="mb-4">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">直近投稿一覧</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">選択中の競合アカウントが直近で公開した投稿です。</p>
              </header>
              <div className="space-y-3">
                {activeCompetitor.posts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]"
                  >
                    <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{post.title}</p>
                      <p className="text-xs text-[color:var(--color-text-muted)]">{post.postedAt}</p>
                    </header>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                      <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5">Imp {post.impressions.toLocaleString()}</span>
                      <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5">Like {post.likes.toLocaleString()}</span>
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1 text-xs font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
                      >
                        投稿を表示
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
