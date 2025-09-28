import { resolveProjectId } from '@/lib/bigquery';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  listContentScripts,
  type StoredContentScript,
} from '@/lib/youtube/bigquery';
import { ScriptGenerateButton } from '@/components/youtube/ScriptGenerateButton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Banner } from '@/components/ui/banner';

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('ja-JP', options).format(value);
}

function formatPercentage(value: number | null | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–';
  const minutes = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${minutes}分${sec.toString().padStart(2, '0')}秒`;
}

function buildNotionUrl(pageId?: string) {
  if (!pageId) return undefined;
  const compact = pageId.replace(/-/g, '');
  return `https://www.notion.so/${compact}`;
}

function formatDateTime(value?: string) {
  if (!value) return '–';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export const dynamic = 'force-dynamic';

export default async function YoutubeDashboardPage() {
  try {
    const data = await getYoutubeDashboardData();

    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
    const context = createYoutubeBigQueryContext(projectId, datasetId);
    await ensureYoutubeTables(context);
    const scripts: StoredContentScript[] = await listContentScripts(context, { limit: 12 });

    const overviewCards = [
      {
        label: '直近30日視聴回数',
        value: formatNumber(Math.round(data.overview.totalViews30d)),
      },
      {
        label: '平均視聴時間',
        value: formatDuration(data.overview.avgViewDuration),
      },
      {
        label: '登録者純増 (30日)',
        value: formatNumber(Math.round(data.overview.subscriberDelta30d)),
      },
    ];

    const own30 = data.analytics.own.last30Days;
    const own7 = data.analytics.own.last7Days;
    const comparison = data.analytics.comparison;

    const ownMetricsRows = [
      {
        label: '視聴回数',
        value30: `${formatNumber(own30.views)} 回`,
        value7: `${formatNumber(own7.views)} 回`,
      },
      {
        label: '視聴時間',
        value30: `${formatNumber(own30.watchTimeMinutes)} 分`,
        value7: `${formatNumber(own7.watchTimeMinutes)} 分`,
      },
      {
        label: '平均視聴持続',
        value30: formatDuration(own30.averageViewDurationSeconds),
        value7: formatDuration(own7.averageViewDurationSeconds),
      },
      {
        label: '登録者純増',
        value30: `${own30.subscriberNet >= 0 ? '+' : ''}${formatNumber(own30.subscriberNet)}`,
        value7: `${own7.subscriberNet >= 0 ? '+' : ''}${formatNumber(own7.subscriberNet)}`,
      },
    ];

    const competitorRows = data.competitors.map((competitor) => ({
      channel: competitor.channelTitle,
      subscribers: competitor.subscriberCount ? `${formatNumber(competitor.subscriberCount)} 人` : '–',
      viewVelocity: competitor.avgViewVelocity ? `${formatNumber(Math.round(competitor.avgViewVelocity))} /日` : '–',
      engagement: formatPercentage(competitor.avgEngagementRate),
      latestVideo:
        competitor.latestVideoTitle
          ? `${competitor.latestVideoTitle} (${competitor.latestVideoViewCount ? formatNumber(competitor.latestVideoViewCount) : '–'}回)`
          : '–',
      latestPublishedAt: competitor.latestVideoPublishedAt ? formatDateTime(competitor.latestVideoPublishedAt) : '–',
    }));

    return (
      <div className="section-stack">
        <div className="glass-card gradient-bg">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">YouTube ダッシュボード</h1>
          {data.overview.latestSnapshotDate ? (
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">最新スナップショット: {String(data.overview.latestSnapshotDate)}</p>
          ) : (
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">まだスナップショットが取り込まれていません。</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overviewCards.map((card) => (
            <Card key={card.label} className="accent-gradient">
              <p className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-[0.08em]">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">自チャンネル指標</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近30日 / 7日のスナップショットを比較します。</p>
          <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table className="text-sm">
              <thead>
                <tr>
                  <th className="w-1/3">指標</th>
                  <th>直近30日</th>
                  <th>直近7日</th>
                </tr>
              </thead>
              <tbody>
                {ownMetricsRows.map((row) => (
                  <tr key={row.label}>
                    <td className="font-medium text-[color:var(--color-text-primary)]">{row.label}</td>
                    <td>{row.value30}</td>
                    <td>{row.value7}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合チャンネルの動向</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新スナップショットでの主要指標です。</p>
          {competitorRows.length ? (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
              <Table className="text-xs">
                <thead>
                <tr>
                  <th>チャンネル</th>
                  <th>登録者</th>
                  <th>平均伸び速度</th>
                  <th>平均ER</th>
                  <th>最新動画</th>
                  <th>投稿日</th>
                </tr>
                </thead>
                <tbody>
                  {competitorRows.map((row) => (
                    <tr key={row.channel}>
                      <td className="font-medium text-[color:var(--color-text-primary)]">{row.channel}</td>
                      <td>{row.subscribers}</td>
                      <td>{row.viewVelocity}</td>
                      <td>{row.engagement}</td>
                      <td>{row.latestVideo}</td>
                      <td>{row.latestPublishedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <EmptyState title="データがありません" description="競合チャンネルの統計が取り込まれると表示されます。" />
          )}
        </Card>

        {comparison ? (
          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">自分 vs 競合</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新スナップショットでの平均値比較です。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ComparisonBlock title="視聴回数" own={comparison.views.own} competitors={comparison.views.competitors} unit="回" />
              <ComparisonBlock title="視聴時間" own={comparison.watchTime.own} competitors={comparison.watchTime.competitors} unit="分" />
              <ComparisonBlock title="平均視聴維持率" own={comparison.retention.own} competitors={comparison.retention.competitors} formatter={formatPercentage} />
              <ComparisonBlock title="登録者増減" own={comparison.subscribers.own} competitors={comparison.subscribers.competitors} />
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">Notion 台本管理</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">Notion に保存された動画台本を一覧で確認できます。</p>
            </div>
            <ScriptGenerateButton />
          </div>

          {scripts.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {scripts.map((script) => (
                <Card key={script.notionPageId} className="accent-gradient">
                  <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{script.title || 'Untitled Script'}</h3>
                  <dl className="mt-3 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                    <div>
                      <dt className="text-xs font-medium text-[color:var(--color-text-muted)]">Hook</dt>
                      <dd className="mt-1 whitespace-pre-line">{script.hook || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-[color:var(--color-text-muted)]">Body</dt>
                      <dd className="mt-1 whitespace-pre-line">{script.body || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-[color:var(--color-text-muted)]">CTA</dt>
                      <dd className="mt-1 whitespace-pre-line">{script.cta || '—'}</dd>
                    </div>
                  </dl>
                  {script.notionPageId ? (
                    <Button variant="link" asChild className="mt-3">
                      <a href={buildNotionUrl(script.notionPageId)} target="_blank" rel="noopener noreferrer">
                        Notionで開く
                      </a>
                    </Button>
                  ) : null}
                </Card>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="台本がまだありません" description="台本生成を実行すると最新案がここに表示されます。" />
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">YouTube ダッシュボードの読み込みに失敗しました</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">環境変数や BigQuery テーブル設定を確認してください。</p>
        </Banner>
      </div>
    );
  }
}

function ComparisonBlock({
  title,
  own,
  competitors,
  unit,
  formatter = (value: number) => `${formatNumber(value)}${unit ?? ''}`,
}: {
  title: string;
  own: number;
  competitors: number;
  unit?: string;
  formatter?: (value: number) => string;
}) {
  return (
    <Card className="bg-white">
      <p className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-[0.08em]">{title}</p>
      <div className="mt-3 flex items-center justify-between text-sm text-[color:var(--color-text-secondary)]">
        <div>
          <p className="text-xs text-[color:var(--color-text-muted)]">自チャンネル</p>
          <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">{formatter(own)}</p>
        </div>
        <div>
          <p className="text-xs text-[color:var(--color-text-muted)]">競合平均</p>
          <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">{formatter(competitors)}</p>
        </div>
      </div>
    </Card>
  );
}

function flatten<T>(arrays: T[][]): T[] {
  return arrays.flat();
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
