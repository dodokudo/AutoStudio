'use client';

import { Fragment, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import type {
  CompetitorAccountSummary,
  CompetitorDashboardData,
  CompetitorReel,
  CompetitorTranscriptSegment,
} from '@/lib/instagram/competitorDashboard';

interface Props {
  data: CompetitorDashboardData;
}

type ReelSort = 'views' | 'likes' | 'comments' | 'newest';

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ja-JP');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTimestamp(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function groupSegments(segments: CompetitorTranscriptSegment[]): CompetitorTranscriptSegment[] {
  const grouped: CompetitorTranscriptSegment[] = [];
  let current: CompetitorTranscriptSegment | null = null;
  for (const segment of segments) {
    if (!current) {
      current = { ...segment };
      continue;
    }
    current.end = segment.end;
    current.text = `${current.text} ${segment.text}`.trim();
    if (current.end - current.start >= 12 || current.text.length >= 150) {
      grouped.push(current);
      current = null;
    }
  }
  if (current) grouped.push(current);
  return grouped;
}

function instagramThumbnailUrl(permalink: string | null): string | null {
  if (!permalink) return null;
  const shortcode = permalink.match(/instagram\.com\/(?:reel|p)\/([^/?#]+)/)?.[1];
  return shortcode ? `/api/instagram/competitor-thumbnail/${encodeURIComponent(shortcode)}` : null;
}

function ReelThumbnail({ reel }: { reel: CompetitorReel }) {
  const [failed, setFailed] = useState(false);
  const src = instagramThumbnailUrl(reel.permalink);
  return (
    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)]">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-[color:var(--color-text-muted)]">サムネなし</div>
      )}
    </div>
  );
}

function AccountSummaryTable({ summaries }: { summaries: CompetitorAccountSummary[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[color:var(--color-border)] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">登録アカウント</h2>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[640px] rounded-none text-sm">
          <thead className="bg-[color:var(--color-surface-muted)] text-xs text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3 text-left">アカウント</th>
              <th className="px-4 py-3 text-right">フォロワー</th>
              <th className="px-4 py-3 text-right">最高再生数</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.username} className="hover:bg-[color:var(--color-surface-muted)]">
                <td className="px-4 py-3">
                  <a href={summary.accountUrl ?? `https://www.instagram.com/${summary.username}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)] hover:underline">
                    @{summary.username}
                  </a>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{num(summary.latestFollowers)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(summary.topReelViews)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

export function CompetitorTab({ data }: Props) {
  const [accountFilter, setAccountFilter] = useState('all');
  const [sortBy, setSortBy] = useState<ReelSort>('views');
  const [expandedMediaId, setExpandedMediaId] = useState<string | null>(null);

  const accounts = useMemo(() => data.accountSummaries.map((summary) => summary.username), [data.accountSummaries]);
  const filteredReels = useMemo(() => {
    const reels = accountFilter === 'all' ? data.topReels : data.topReels.filter((reel) => reel.username === accountFilter);
    return [...reels].sort((a, b) => {
      if (sortBy === 'likes') return (b.likeCount ?? 0) - (a.likeCount ?? 0);
      if (sortBy === 'comments') return (b.commentsCount ?? 0) - (a.commentsCount ?? 0);
      if (sortBy === 'newest') {
        return (b.postedAt ? new Date(b.postedAt).getTime() : 0) - (a.postedAt ? new Date(a.postedAt).getTime() : 0);
      }
      return (b.viewCount ?? 0) - (a.viewCount ?? 0);
    }).slice(0, 60);
  }, [accountFilter, data.topReels, sortBy]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--color-border)] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">競合リール</h1>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">伸びたリールを比較し、保存動画と文字起こしを確認します。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                アカウント
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]">
                  <option value="all">全アカウント</option>
                  {accounts.map((username) => <option key={username} value={username}>@{username}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                並び替え
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as ReelSort)} className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]">
                  <option value="views">再生数が多い順</option>
                  <option value="likes">いいねが多い順</option>
                  <option value="comments">コメントが多い順</option>
                  <option value="newest">新しい順</option>
                </select>
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">{accountFilter === 'all' ? '全アカウント' : `@${accountFilter}`}・{filteredReels.length}件表示</p>
        </div>

        {filteredReels.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[980px] rounded-none text-xs">
              <thead className="bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">リール</th>
                  <th className="px-4 py-3 text-right">再生数</th>
                  <th className="px-4 py-3 text-right">いいね</th>
                  <th className="px-4 py-3 text-right">コメント</th>
                  <th className="px-4 py-3 text-right">投稿日</th>
                  <th className="px-4 py-3 text-right">動画</th>
                  <th className="px-4 py-3 text-right">台本</th>
                </tr>
              </thead>
              <tbody>
                {filteredReels.map((reel) => {
                  const isExpanded = expandedMediaId === reel.instagramMediaId;
                  const hasTranscript = reel.transcriptSegments.length > 0;
                  const storedVideo = reel.driveFileUrl && (reel.driveFileUrl.includes('drive.google.com') || reel.driveFileUrl.includes('storage.googleapis.com')) ? reel.driveFileUrl : null;
                  const segments = groupSegments(reel.transcriptSegments);
                  return (
                    <Fragment key={`${reel.username}-${reel.instagramMediaId}`}>
                      <tr className="hover:bg-[color:var(--color-surface-muted)]">
                        <td className="px-4 py-3">
                          <div className="flex min-w-[390px] items-start gap-3">
                            <ReelThumbnail reel={reel} />
                            <div className="min-w-0 py-1">
                              <a href={reel.permalink ?? `https://www.instagram.com/${reel.username}/`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)] hover:underline">@{reel.username}</a>
                              <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--color-text-secondary)]">{reel.caption || '(キャプションなし)'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[color:var(--color-text-primary)]">{num(reel.viewCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(reel.likeCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(reel.commentsCount)}</td>
                        <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">{formatDate(reel.postedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {storedVideo ? (
                            <a href={storedVideo} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 font-semibold text-[color:var(--color-text-primary)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]">保存動画</a>
                          ) : <span className="text-[color:var(--color-text-muted)]">未保存</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" aria-expanded={isExpanded} disabled={!hasTranscript} onClick={() => setExpandedMediaId(isExpanded ? null : reel.instagramMediaId)} className={`whitespace-nowrap rounded-[var(--radius-sm)] border px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] ${hasTranscript ? isExpanded ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-primary)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]' : 'cursor-not-allowed border-transparent bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]'}`}>
                            {hasTranscript ? (isExpanded ? '台本を閉じる' : '台本を見る') : '文字起こし待ち'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasTranscript ? (
                        <tr>
                          <td colSpan={7} className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-5 py-5 sm:px-6">
                            <div className="mb-4 flex items-baseline justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">タイムライン付き台本</h3>
                                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">時系列に沿って内容を確認できます。</p>
                              </div>
                              <span className="text-xs text-[color:var(--color-text-muted)]">{segments.length}区間</span>
                            </div>
                            <div className="max-h-[620px] overflow-y-auto rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
                              {segments.map((segment, index) => (
                                <div key={`${segment.start}-${index}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-[color:var(--color-border)] px-4 py-3 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-5">
                                  <span className="tabular-nums font-semibold text-[color:var(--color-accent)]">{formatTimestamp(segment.start)}</span>
                                  <p className="text-sm leading-7 text-[color:var(--color-text-primary)]">{segment.text}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-sm text-[color:var(--color-text-muted)]">該当するリールがありません</div>
        )}
      </Card>

      <AccountSummaryTable summaries={data.accountSummaries} />
    </div>
  );
}
