'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { HomeDashboardData, HomeHighlight } from '@/lib/home/dashboard';
import { ScriptGenerateButton } from '@/components/youtube/ScriptGenerateButton';

interface HomeDashboardShellProps {
  data: HomeDashboardData;
  rangeOptions: Array<{ value: string; label: string }>;
  selectedRange: string;
}

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return numberFormatter.format(value);
}

function formatDelta(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value === 0) return '±0';
  return `${value > 0 ? '+' : ''}${numberFormatter.format(value)}`;
}

type TopCardKey = 'threads' | 'instagram' | 'youtube' | 'line' | 'clicks';

type TopCard = {
  key: TopCardKey;
  label: string;
  value: string;
  delta?: string | null;
  description?: string | null;
};

const HOME_TAB_ITEMS = [{ id: 'home', label: 'ホーム' }];
const NOOP = () => {};

export function HomeDashboardShell({ data, rangeOptions, selectedRange }: HomeDashboardShellProps) {
  const { followerBreakdown, highlights, tasks, lineFunnel, lineRegistrationBySource, clickSummary, platformSummaries } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === rangeOptions[0]?.value) {
      params.delete('range');
    } else {
      params.set('range', value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const orderedPlatforms: Array<'threads' | 'instagram' | 'youtube' | 'line'> = ['threads', 'instagram', 'youtube', 'line'];
  const followerCards: TopCard[] = [];
  orderedPlatforms.forEach((platform) => {
    const item = followerBreakdown.find((entry) => entry.platform === platform);
    if (!item) return;
    followerCards.push({
      key: platform,
      label: item.label,
      value: `${formatNumber(item.count)} 人`,
      delta: formatDelta(item.delta),
    });
  });

  const lineIndex = followerCards.findIndex((card) => card.key === 'line');
  const clickCard: TopCard = {
    key: 'clicks',
    label: '直近クリック数',
    value: `${formatNumber(clickSummary.total)} 件`,
    description: clickSummary.breakdown,
  };
  const topCards = [...followerCards];
  topCards.splice(lineIndex >= 0 ? lineIndex : topCards.length, 0, clickCard);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={HOME_TAB_ITEMS}
          value="home"
          onChange={NOOP}
          className="flex-1 min-w-[160px]"
        />
        <DashboardDateRangePicker
          options={rangeOptions}
          value={selectedRange}
          onChange={handleRangeChange}
          allowCustom={false}
          latestLabel={`最新 ${data.period.end}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {topCards.map((card) => (
          <Card key={card.key} className={dashboardCardClass}>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
            {card.delta ? <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">{card.delta}</p> : null}
            {card.description ? (
              <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">{card.description}</p>
            ) : null}
          </Card>
        ))}
      </div>

      {platformSummaries?.length ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">媒体別ファネル分析</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">Threads / Instagram / YouTube の主要指標サマリー。</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            {platformSummaries.map((platform) => (
              <div
                key={platform.key}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[160px]">
                    <p className="text-base font-semibold text-[color:var(--color-text-primary)]">{platform.title}</p>
                  </div>
                  <dl className="flex flex-1 flex-wrap items-start gap-x-8 gap-y-4 text-sm text-[color:var(--color-text-secondary)]">
                    {platform.metrics.map((metric) => (
                      <div key={`${platform.key}-${metric.label}`} className="min-w-[140px]">
                        <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{metric.label}</dt>
                        <dd className="mt-1 text-lg font-semibold text-[color:var(--color-text-primary)]">{metric.value}</dd>
                        {metric.helper ? (
                          <p className="mt-0.5 text-xs text-[color:var(--color-text-secondary)]">{metric.helper}</p>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">チャネル別フォロワー内訳</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">フォロワー総数と期間内増減を一覧表示。</p>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table className="text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">プラットフォーム</th>
                  <th className="px-4 py-2 text-left">フォロワー</th>
                  <th className="px-4 py-2 text-left">期間増減</th>
                </tr>
              </thead>
              <tbody>
                {followerBreakdown.map((item) => (
                  <tr key={item.platform}>
                    <td className="px-4 py-2 font-medium text-[color:var(--color-text-primary)]">{item.label}</td>
                    <td className="px-4 py-2">{formatNumber(item.count)}</td>
                    <td className="px-4 py-2 text-[color:var(--color-text-secondary)]">{formatDelta(item.delta) ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">媒体別LINE登録数</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">期間内の登録数を媒体ごとに集計しています。</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2">
              <span className="text-[color:var(--color-text-muted)]">最新友だち数</span>
              <span className="font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(followerBreakdown.find((item) => item.platform === 'line')?.count ?? 0)}
              </span>
            </div>
            <ul className="space-y-2 text-sm text-[color:var(--color-text-secondary)]">
              {lineRegistrationBySource.map((source) => (
                <li key={source.source} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] px-3 py-2">
                  <span>{source.source}</span>
                  <span className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(source.registrations)}</span>
                </li>
              ))}
            </ul>
            <Link href="/line" className="block text-sm text-[color:var(--color-accent)] hover:underline">
              LINEタブで詳細を見る
            </Link>
          </div>
        </Card>
      </section>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">次のアクション</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">チャネル横断で今すぐ確認すべき項目です。</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {tasks.map((task) => (
            <div key={task.platform} className="flex items-start justify-between rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{task.title}</p>
                <p className="text-xs text-[color:var(--color-text-secondary)]">{task.description ?? '最新状況をチェック'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{task.value}</p>
                {task.href ? (
                  <Link href={task.href} className="text-xs text-[color:var(--color-accent)] hover:underline">
                    詳細を見る
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">注目コンテンツ</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近で反応の良かった投稿をピックアップ。</p>
          </div>
          <ScriptGenerateButton themeKeyword="YouTube動画" />
        </div>

        {highlights.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlights.map((highlight) => (
              <HighlightCard key={`${highlight.platform}-${highlight.title}`} highlight={highlight} />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="ハイライトがありません" description="チャネルの分析データが取り込まれると表示されます。" />
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">LINE ファネル状況</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">主要タグを用いたファネル遷移の概況です。</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {lineFunnel.map((stage) => (
            <Card key={stage.stage} className="border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{stage.stage}</p>
              <p className="mt-2 text-xl font-semibold text-[color:var(--color-text-primary)]">{formatNumber(stage.users)}</p>
            </Card>
          ))}
        </div>
      </Card>

      <Card className="p-6 accent-gradient">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">広告ダッシュボード</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              CPAや消化金額などの広告KPIは近日追加予定です。データ連携後に自動で反映されます。
            </p>
          </div>
          <Button variant="secondary" className="px-4" disabled>
            準備中
          </Button>
        </div>
      </Card>
    </div>
  );
}

function HighlightCard({ highlight }: { highlight: HomeHighlight }) {
  return (
    <Card className="h-full overflow-hidden border border-[color:var(--color-border)]">
      {highlight.mediaUrl ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          <Image
            src={highlight.mediaUrl}
            alt={highlight.title}
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{highlight.platform.toUpperCase()}</p>
        <h3 className="mt-2 text-sm font-semibold text-[color:var(--color-text-primary)]">{highlight.title}</h3>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">{highlight.summary}</p>
        <p className="mt-3 text-sm font-semibold text-[color:var(--color-text-primary)]">
          {highlight.metricLabel}: {highlight.metricValue}
        </p>
        {highlight.permalink ? (
          <Link href={highlight.permalink} target="_blank" className="mt-3 inline-block text-xs text-[color:var(--color-accent)] hover:underline">
            投稿を見る
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
