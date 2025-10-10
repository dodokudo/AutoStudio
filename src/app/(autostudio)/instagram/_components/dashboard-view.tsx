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
      <ProfileHeader userId="instagram" />

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
            <div
              key={stat.label}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]"
            >
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
          {followerTrend.length ? (
            <FollowerChart data={data.followerSeries} />
          ) : (
            <EmptyState title="データがありません" description="分析データを取り込み次第表示されます。" />
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">直近リール ハイライト</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近45日でパフォーマンスの高いリールを抽出しています。</p>
        {data.reels.length ? (
          <ul className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
            {data.reels.map((item) => (
              <li key={item.instagramId} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                      {item.caption?.trim() ? item.caption : 'キャプション未入力'}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                      {item.views !== null ? <span>閲覧 {item.views.toLocaleString()}</span> : null}
                      {item.reach !== null ? <span>リーチ {item.reach.toLocaleString()}</span> : null}
                      {item.likeCount !== null ? <span>いいね {item.likeCount.toLocaleString()}</span> : null}
                      {item.commentsCount !== null ? <span>コメント {item.commentsCount.toLocaleString()}</span> : null}
                      {item.saved !== null ? <span>保存 {item.saved.toLocaleString()}</span> : null}
                      {item.shares !== null ? <span>シェア {item.shares.toLocaleString()}</span> : null}
                      {item.avgWatchTimeSeconds !== null ? <span>平均視聴 {Math.round(item.avgWatchTimeSeconds)}秒</span> : null}
                    </div>
                  </div>
                  <div className="min-w-[120px] text-right text-xs text-[color:var(--color-text-muted)]">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '日時不明'}
                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                      >
                        リールを開く
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="データがありません" description="リールの集計が取り込まれると表示されます。" />
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">直近ストーリーズ ハイライト</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">完了率や反応が高いストーリーズを表示します。</p>
        {data.stories.length ? (
          <ul className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
            {data.stories.map((story) => (
              <li key={story.instagramId} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                      {story.caption?.trim() ? story.caption : 'キャプション未入力'}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-[color:var(--color-text-muted)]">
                      {story.reach !== null ? <span>リーチ {story.reach.toLocaleString()}</span> : null}
                      {story.views !== null ? <span>閲覧 {story.views.toLocaleString()}</span> : null}
                      {story.replies !== null ? <span>返信 {story.replies.toLocaleString()}</span> : null}
                      {story.profileVisits !== null ? <span>プロフ閲覧 {story.profileVisits.toLocaleString()}</span> : null}
                      {story.completionRate !== null ? (
                        <span>完読率 {(story.completionRate * 100).toFixed(1)}%</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-[120px] text-right text-xs text-[color:var(--color-text-muted)]">
                    {story.timestamp ? new Date(story.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '日時不明'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="データがありません" description="ストーリーズの集計が取り込まれると表示されます。" />
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
            <article
              key={`${script.title}-${index}`}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4"
            >
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

function RichField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--color-text-secondary)]">{value}</p>
    </div>
  );
}
