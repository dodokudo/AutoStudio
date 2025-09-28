'use client';

import { useMemo, useState } from 'react';
import type { InstagramDashboardData } from '@/lib/instagram/dashboard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ProfileHeader } from '@/components/ui/ProfileHeader';
import { FollowerChart } from '@/components/charts/FollowerChart';

interface Props {
  data: InstagramDashboardData;
}

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'scripts', label: '台本' },
] as const;

export function InstagramDashboardView({ data }: Props) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('dashboard');

  return (
    <div className="section-stack">
      <ProfileHeader userId="demo-user" />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'dashboard' ? <DashboardTab data={data} /> : <ScriptsTab data={data} />}
    </div>
  );
}

function DashboardTab({ data }: Props) {
  const latestFollowers = data.latestFollower?.followers ?? 0;
  const latestReach = data.latestFollower?.reach ?? 0;
  const latestEngagement = data.latestFollower?.engagement ?? 0;

  const followerTrend = useMemo(() => data.followerSeries.slice(0, 14), [data.followerSeries]);
  const hookIdeas = useMemo(
    () => dedupe(flatten(data.transcriptInsights.map((item) => item.hooks))).slice(0, 6),
    [data.transcriptInsights],
  );
  const ctaIdeas = useMemo(
    () => dedupe(flatten(data.transcriptInsights.map((item) => item.ctaIdeas))).slice(0, 6),
    [data.transcriptInsights],
  );
  const activeCompetitors = data.userCompetitors.filter((item) => item.active);

  const overviewStats = [
    { label: 'フォロワー', value: latestFollowers.toLocaleString(), caption: '最新スナップショット' },
    { label: 'リーチ', value: latestReach.toLocaleString(), caption: '最新スナップショット' },
    { label: 'エンゲージメント', value: latestEngagement.toLocaleString(), caption: '最新スナップショット' },
  ];

  return (
    <div className="section-stack">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
              <p className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-[0.08em]">
                {stat.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{stat.value}</p>
              <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{stat.caption}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">フォロワー推移</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近のフォロワー／リーチ／エンゲージメント推移です。</p>
        <div className="mt-6">
          {followerTrend.length ? <FollowerChart data={data.followerSeries} /> : <EmptyState title="データがありません" description="分析データを取り込み次第表示されます。" />}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合ハイライト</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近14日でパフォーマンスの高かったリールを抜粋しています。</p>
        {data.competitorHighlights.length ? (
          <ul className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
            {data.competitorHighlights.map((item) => (
              <li key={`${item.username}-${item.permalink ?? 'na'}`} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-[color:var(--color-text-primary)]">@{item.username}</p>
                    {item.caption ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[color:var(--color-text-muted)]">{item.caption}</p>
                    ) : null}
                  </div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {item.views !== null ? <span className="mr-2">Views {item.views.toLocaleString()}</span> : null}
                    {item.likes !== null ? <span className="mr-2">Likes {item.likes.toLocaleString()}</span> : null}
                    {item.comments !== null ? <span>Comments {item.comments.toLocaleString()}</span> : null}
                  </div>
                </div>
                {item.permalink ? (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-xs text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                  >
                    リールを開く
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="データがありません" description="競合リールが取り込まれるとここに表示されます。" />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">Hook / CTA アイデア</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <IdeaList title="Hook" items={hookIdeas} emptyText="Hook 情報がまだありません。" />
          <IdeaList title="CTA" items={ctaIdeas} emptyText="CTA 情報がまだありません。" />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">登録済みの競合アカウント</h2>
        {activeCompetitors.length ? (
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
            {activeCompetitors.map((item) => (
              <li key={item.username} className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2">
                <p className="font-medium text-[color:var(--color-text-primary)]">@{item.username}</p>
                <p className="text-xs text-[color:var(--color-text-muted)]">
                  {item.category ? `${item.category} / ` : ''}優先度 {item.priority}
                  {item.driveFolderId ? ` / Drive: ${item.driveFolderId}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState title="競合が登録されていません" description="右下のフォームから競合を追加できます。" />
          </div>
        )}
      </Card>
    </div>
  );
}

function ScriptsTab({ data }: Props) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">最新の台本案</h2>
      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近生成された台本案を表示します。</p>
      {data.scripts.length ? (
        <div className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
          {data.scripts.map((script, index) => (
            <article key={`${script.title}-${index}`} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
              <header className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[color:var(--color-text-muted)]">Script {index + 1}</span>
                <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{script.title}</h3>
              </header>
              <div className="mt-3 space-y-3">
                <RichField label="Hook" value={script.hook} />
                <RichField label="Body" value={script.body} />
                <RichField label="CTA" value={script.cta} />
                <RichField label="Story" value={script.storyText} />
                {script.inspirationSources.length ? (
                  <p className="text-xs text-[color:var(--color-text-muted)]">
                    Inspiration: {script.inspirationSources.join(', ')}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <EmptyState title="台本がまだありません" description="台本生成ジョブを実行するとここに表示されます。" />
        </div>
      )}
    </Card>
  );
}

function IdeaList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
      <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">{emptyText}</p>
      )}
    </div>
  );
}

function RichField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--color-text-secondary)]">{value}</p>
    </div>
  );
}

function flatten<T>(value: T[][]): T[] {
  return value.flat();
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
