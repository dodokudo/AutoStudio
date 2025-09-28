'use client';

import { useMemo, useState } from 'react';
import type { InstagramDashboardData } from '@/lib/instagram/dashboard';

const SECTION_CLASS = 'space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6';
const TITLE_CLASS = 'text-base font-semibold text-white';

interface Props {
  data: InstagramDashboardData;
}

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'scripts', label: '台本' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function InstagramDashboardView({ data }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_14px_28px_rgba(111,126,252,0.35)]'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'dashboard' ? <DashboardTab data={data} /> : <ScriptsTab data={data} />}
    </div>
  );
}

function DashboardTab({ data }: Props) {
  const latestFollowers = data.latestFollower?.followers ?? 0;
  const latestReach = data.latestFollower?.reach ?? 0;
  const engagement = data.latestFollower?.engagement ?? 0;
  const followerTrend = useMemo(() => data.followerSeries.slice(0, 7), [data.followerSeries]);
  const hookIdeas = useMemo(() => dedupe(flatten(data.transcriptInsights.map((item) => item.hooks))).slice(0, 6), [
    data.transcriptInsights,
  ]);
  const ctaIdeas = useMemo(() => dedupe(flatten(data.transcriptInsights.map((item) => item.ctaIdeas))).slice(0, 6), [
    data.transcriptInsights,
  ]);
  const userCompetitors = data.userCompetitors.filter((item) => item.active);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="フォロワー" value={latestFollowers} subtitle="最新スナップショット" />
        <StatCard title="リーチ" value={latestReach} subtitle="最新スナップショット" />
        <StatCard title="エンゲージメント" value={engagement} subtitle="最新スナップショット" />
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={TITLE_CLASS}>フォロワー推移（直近7件）</h2>
        {followerTrend.length > 0 ? (
          <ul className="grid gap-2 text-sm text-slate-200 md:grid-cols-2">
            {followerTrend.map((point) => (
              <li key={point.date} className="flex items-center justify-between rounded-md border border-slate-800/60 bg-slate-900/70 px-3 py-2">
                <span className="text-slate-300">{point.date}</span>
                <div className="text-right">
                  <p className="font-semibold text-white">{formatNumber(point.followers)} followers</p>
                  <p className="text-xs text-slate-400">reach {formatNumber(point.reach)} / engagement {formatNumber(point.engagement)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">フォロワーデータがまだありません。</p>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={TITLE_CLASS}>競合ハイライト</h2>
        {data.competitorHighlights.length > 0 ? (
          <div className="space-y-3">
            {data.competitorHighlights.map((item, index) => (
              <article
                key={`${item.username}-${index}`}
                className="space-y-2 rounded-md border border-slate-800/70 bg-slate-900/70 p-4 text-sm text-slate-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">@{item.username}</p>
                    {item.caption ? (
                      <p className="text-xs text-slate-400 line-clamp-2">{item.caption}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Views {formatNumber(item.views)}</p>
                    <p>Likes {formatNumber(item.likes)} / Comments {formatNumber(item.comments)}</p>
                  </div>
                </div>
                {item.permalink ? (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                  >
                    リールを開く ↗
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">まだ競合リールが取り込まれていません。</p>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={TITLE_CLASS}>Hook / CTA アイデア</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <IdeaList title="Hook" items={hookIdeas} emptyText="まだ Hook 情報がありません。" />
          <IdeaList title="CTA" items={ctaIdeas} emptyText="まだ CTA 情報がありません。" />
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={TITLE_CLASS}>ユーザー追加の競合</h2>
        {userCompetitors.length > 0 ? (
          <ul className="space-y-2 text-sm text-slate-200">
            {userCompetitors.map((item) => (
              <li key={item.username} className="rounded-md border border-slate-800/70 bg-slate-900/70 px-3 py-2">
                <p className="font-semibold text-white">@{item.username}</p>
                <p className="text-xs text-slate-400">
                  {item.category ? `${item.category} / ` : ''}優先度 {item.priority}
                  {item.driveFolderId ? ` / Drive: ${item.driveFolderId}` : ''}
                  {item.source === 'private' ? '（デフォルト）' : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">まだユーザー追加の競合がありません。</p>
        )}
      </section>
    </div>
  );
}

function ScriptsTab({ data }: Props) {
  return (
    <section className={SECTION_CLASS}>
      <h2 className={TITLE_CLASS}>最新の台本案</h2>
      {data.scripts.length > 0 ? (
        <div className="space-y-4">
          {data.scripts.map((script, index) => (
            <article key={`${script.title}-${index}`} className="space-y-3 rounded-md border border-slate-800/70 bg-slate-900/70 p-4">
              <header className="flex flex-col gap-1 text-sm text-slate-200">
                <span className="text-xs uppercase tracking-wide text-indigo-300">Script {index + 1}</span>
                <h3 className="text-lg font-semibold text-white">{script.title}</h3>
              </header>
              <div className="space-y-3 text-sm text-slate-200">
                <RichField label="Hook" value={script.hook} />
                <RichField label="Body" value={script.body} />
                <RichField label="CTA" value={script.cta} />
                <RichField label="Story" value={script.storyText} />
                {script.inspirationSources.length > 0 ? (
                  <p className="text-xs text-slate-400">Inspiration: {script.inspirationSources.join(', ')}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">まだ生成済みの台本がありません。`npm run ig:generate` を実行してください。</p>
      )}
    </section>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(value)}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function IdeaList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {items.length > 0 ? (
        <ul className="space-y-2 text-xs text-slate-300">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-md border border-slate-800/60 bg-slate-900/70 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function RichField({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-200">{value}</p>
    </div>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }
  return new Intl.NumberFormat('ja-JP').format(value);
}

function flatten<T>(arrays: T[][]): T[] {
  return arrays.reduce<T[]>((acc, items) => acc.concat(items), []);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
