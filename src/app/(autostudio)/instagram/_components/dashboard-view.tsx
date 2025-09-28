'use client';

import { useMemo, useState } from 'react';
import type { InstagramDashboardData } from '@/lib/instagram/dashboard';
import { StatPill } from '@/components/ui/StatPill';
import { CircleGauge } from '@/components/ui/CircleGauge';
import { FollowerChart } from '@/components/charts/FollowerChart';
import { ProfileHeader } from '@/components/ui/ProfileHeader';
import { Card } from '@/components/ui/card';

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
      {/* プロフィールヘッダー */}
      <ProfileHeader userId="demo-user" />

      <div className="flex items-center gap-2">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[color:var(--color-accent)] text-white shadow-[var(--shadow-elevated)]'
                  : 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-hover)]'
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="フォロワー" value={latestFollowers} subtitle="最新スナップショット" />
        <StatCard title="リーチ" value={latestReach} subtitle="最新スナップショット" />
        <StatCard title="エンゲージメント" value={engagement} subtitle="最新スナップショット" />
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">フォロワー推移とインサイト</h2>
        {followerTrend.length > 0 ? (
          <FollowerChart data={data.followerSeries} />
        ) : (
          <div className="ui-empty-state">
            <p>フォロワーデータがまだありません。</p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合ハイライト</h2>
        {data.competitorHighlights.length > 0 ? (
          <div className="space-y-3">
            {data.competitorHighlights.map((item, index) => (
              <article
                key={`${item.username}-${index}`}
                className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-sm text-[color:var(--color-text-primary)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[color:var(--color-text-primary)]">@{item.username}</p>
                    {item.caption ? (
                      <p className="text-xs text-[color:var(--color-text-secondary)] line-clamp-2">{item.caption}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-[color:var(--color-text-secondary)]">
                    <p>Views {formatNumber(item.views)}</p>
                    <p>Likes {formatNumber(item.likes)} / Comments {formatNumber(item.comments)}</p>
                  </div>
                </div>
                {item.permalink ? (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                  >
                    リールを開く ↗
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--color-text-muted)]">まだ競合リールが取り込まれていません。</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">Hook / CTA アイデア</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <IdeaList title="Hook" items={hookIdeas} emptyText="まだ Hook 情報がありません。" />
          <IdeaList title="CTA" items={ctaIdeas} emptyText="まだ CTA 情報がありません。" />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ユーザー追加の競合</h2>
        {userCompetitors.length > 0 ? (
          <ul className="space-y-2 text-sm text-[color:var(--color-text-primary)]">
            {userCompetitors.map((item) => (
              <li key={item.username} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-3 py-2">
                <p className="font-semibold text-[color:var(--color-text-primary)]">@{item.username}</p>
                <p className="text-xs text-[color:var(--color-text-secondary)]">
                  {item.category ? `${item.category} / ` : ''}優先度 {item.priority}
                  {item.driveFolderId ? ` / Drive: ${item.driveFolderId}` : ''}
                  {item.source === 'private' ? '（デフォルト）' : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[color:var(--color-text-muted)]">まだユーザー追加の競合がありません。</p>
        )}
      </Card>
    </div>
  );
}

function ScriptsTab({ data }: Props) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">最新の台本案</h2>
      {data.scripts.length > 0 ? (
        <div className="space-y-4">
          {data.scripts.map((script, index) => (
            <article key={`${script.title}-${index}`} className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <header className="flex flex-col gap-1 text-sm text-[color:var(--color-text-primary)]">
                <span className="text-xs uppercase tracking-wide text-[color:var(--color-accent)]">Script {index + 1}</span>
                <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{script.title}</h3>
              </header>
              <div className="space-y-3 text-sm text-[color:var(--color-text-primary)]">
                <RichField label="Hook" value={script.hook} />
                <RichField label="Body" value={script.body} />
                <RichField label="CTA" value={script.cta} />
                <RichField label="Story" value={script.storyText} />
                {script.inspirationSources.length > 0 ? (
                  <p className="text-xs text-[color:var(--color-text-secondary)]">Inspiration: {script.inspirationSources.join(', ')}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--color-text-muted)]">まだ生成済みの台本がありません。`npm run ig:generate` を実行してください。</p>
      )}
    </Card>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) {
  // エンゲージメント率の計算（仮定値）
  const engagementRate = title === 'エンゲージメント' ? Math.min((value / 1000) * 100, 100) : 0;

  // アイコンマッピング
  const iconMap: Record<string, string> = {
    'フォロワー': '👥',
    'リーチ': '📈',
    'エンゲージメント': '💝'
  };

  // カラーマッピング
  const colorMap: Record<string, 'blue' | 'green' | 'purple' | 'orange' | 'teal'> = {
    'フォロワー': 'blue',
    'リーチ': 'green',
    'エンゲージメント': 'purple'
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-sm text-[color:var(--color-text-primary)]">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">{formatNumber(value)}</p>
          {subtitle ? <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{subtitle}</p> : null}
        </div>
        <div className="flex flex-col items-center gap-2">
          <StatPill
            icon={iconMap[title] || '📊'}
            value={formatNumber(value)}
            color={colorMap[title] || 'blue'}
          />
          {title === 'エンゲージメント' && (
            <CircleGauge
              value={engagementRate}
              size="md"
              color="purple"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IdeaList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
      {items.length > 0 ? (
        <ul className="space-y-2 text-xs text-[color:var(--color-text-primary)]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[color:var(--color-text-muted)]">{emptyText}</p>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--color-text-primary)]">{value}</p>
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