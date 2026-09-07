'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import type {
  CompetitorAccountSummary,
  CompetitorDashboardData,
  CompetitorReel,
  CompetitorTranscriptSegment,
} from '@/lib/instagram/competitorDashboard';
import type { CompetitorTranscriptChapter } from '@/lib/instagram/competitorTranscript';

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

function chapterSegmentIndex(chapter: CompetitorTranscriptChapter, segments: CompetitorTranscriptSegment[]): number {
  const index = segments.findIndex((segment) => segment.end > chapter.start);
  return index >= 0 ? index : Math.max(segments.length - 1, 0);
}

function formatDuration(value: number | null): string {
  return value === null ? '—' : formatTimestamp(value);
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

function ReelVisualTimeline({ reel, storedVideo }: { reel: CompetitorReel; storedVideo: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hookFrames = reel.visualTimeline.filter((frame) => frame.phase === 'hook');
  const bodyFrames = reel.visualTimeline.filter((frame) => frame.phase === 'body');

  function jumpTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    video.pause();
    video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <section className="mb-5 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
      <div className="grid lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="border-b border-[color:var(--color-border)] bg-black p-3 lg:border-b-0 lg:border-r">
          <video ref={videoRef} src={storedVideo} className="mx-auto aspect-[9/16] w-full max-w-48 bg-black object-contain" controls playsInline preload="metadata" />
        </div>
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">冒頭フック 0〜3秒</h3>
            {reel.hookLabels.map((label) => (
              <span key={label} className="rounded-full bg-[color:var(--color-accent-soft)] px-2 py-1 text-[11px] font-semibold text-[color:var(--color-accent)]">{label}</span>
            ))}
          </div>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-[color:var(--color-text-primary)]">{reel.hookText || '冒頭フックを解析中です。'}</p>
          {hookFrames.length ? (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {hookFrames.map((frame) => (
                <button key={frame.time} type="button" onClick={() => jumpTo(frame.time)} className="group overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.imageUrl} alt={`${frame.time.toFixed(1)}秒の映像`} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                  <span className="block px-2 py-1.5 text-xs font-semibold tabular-nums text-[color:var(--color-accent)] group-hover:underline">{frame.time.toFixed(1)}秒</span>
                </button>
              ))}
            </div>
          ) : <p className="mt-4 text-xs text-[color:var(--color-text-muted)]">冒頭スクショを生成中です。</p>}
        </div>
      </div>
      {bodyFrames.length ? (
        <div className="border-t border-[color:var(--color-border)] px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">映像タイムライン</h3>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">場面を押すと左の動画がその位置へ移動します。</p>
            </div>
            <span className="text-xs text-[color:var(--color-text-muted)]">{formatDuration(reel.durationSeconds)}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {bodyFrames.map((frame) => (
              <button key={frame.time} type="button" onClick={() => jumpTo(frame.time)} className="w-36 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-left hover:border-[color:var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame.imageUrl} alt={`${formatTimestamp(frame.time)}の映像`} className="aspect-[9/16] w-full object-cover" loading="lazy" />
                <span className="block px-2 pt-2 text-xs font-semibold tabular-nums text-[color:var(--color-accent)]">{formatTimestamp(frame.time)}</span>
                <span className="line-clamp-3 block px-2 pb-2 pt-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">{frame.spokenText}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
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
            <Table className="min-w-[1060px] rounded-none text-xs">
              <thead className="bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">リール</th>
                  <th className="px-4 py-3 text-right">再生数</th>
                  <th className="px-4 py-3 text-right">いいね</th>
                  <th className="px-4 py-3 text-right">コメント</th>
                  <th className="px-4 py-3 text-right">尺</th>
                  <th className="px-4 py-3 text-right">投稿日</th>
                  <th className="px-4 py-3 text-right">動画</th>
                  <th className="px-4 py-3 text-right">台本</th>
                </tr>
              </thead>
              <tbody>
                {filteredReels.map((reel) => {
                  const isExpanded = expandedMediaId === reel.instagramMediaId;
                  const hasTranscript = reel.transcriptSegments.length > 0;
                  const isUnavailable = reel.driveFileUrl?.startsWith('unavailable:') ?? false;
                  const storedVideo = reel.driveFileUrl && (reel.driveFileUrl.includes('drive.google.com') || reel.driveFileUrl.includes('storage.googleapis.com')) ? reel.driveFileUrl : null;
                  const segments = reel.transcriptSegments;
                  return (
                    <Fragment key={`${reel.username}-${reel.instagramMediaId}`}>
                      <tr className="hover:bg-[color:var(--color-surface-muted)]">
                        <td className="px-4 py-3">
                          <div className="flex min-w-[390px] items-start gap-3">
                            <ReelThumbnail reel={reel} />
                            <div className="min-w-0 py-1">
                              <a href={reel.permalink ?? `https://www.instagram.com/${reel.username}/`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)] hover:underline">@{reel.username}</a>
                              <p className={`mt-2 line-clamp-2 text-sm font-medium leading-6 ${reel.transcriptTitle ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-muted)]'}`}>
                                {reel.transcriptTitle || '文字起こし後に動画タイトルを表示'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[color:var(--color-text-primary)]">{num(reel.viewCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(reel.likeCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(reel.commentsCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{formatDuration(reel.durationSeconds)}</td>
                        <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">{formatDate(reel.postedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {storedVideo ? (
                            <a href={storedVideo} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 font-semibold text-[color:var(--color-text-primary)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]">保存動画</a>
                          ) : <span className="text-[color:var(--color-text-muted)]">{isUnavailable ? '取得不可' : '未保存'}</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" aria-expanded={isExpanded} disabled={!hasTranscript} onClick={() => setExpandedMediaId(isExpanded ? null : reel.instagramMediaId)} className={`whitespace-nowrap rounded-[var(--radius-sm)] border px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] ${hasTranscript ? isExpanded ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-primary)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]' : 'cursor-not-allowed border-transparent bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]'}`}>
                            {hasTranscript ? (isExpanded ? '台本を閉じる' : '台本を見る') : isUnavailable ? '動画削除済み' : '文字起こし待ち'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasTranscript ? (
                        <tr id={`transcript-${reel.instagramMediaId}`}>
                          <td colSpan={8} className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-5 py-5 sm:px-6">
                            <div className="w-full">
                              {storedVideo ? <ReelVisualTimeline reel={reel} storedVideo={storedVideo} /> : null}
                              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                                <div>
                                  <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">タイムライン付き台本</h3>
                                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">左の目次で章へ移動できます。台本の時刻を押すと保存動画の該当位置から再生します。</p>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
                                  <span>{reel.transcriptChapters.length}章</span>
                                  <span>{segments.length}区間</span>
                                </div>
                              </div>
                              <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                                <aside className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] lg:max-h-[680px] lg:overflow-y-auto">
                                  <div className="border-b border-[color:var(--color-border)] px-4 py-3">
                                    <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">台本の構成</p>
                                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">台本から自動で区切った目次</p>
                                  </div>
                                  <nav aria-label="台本の構成" className="p-2">
                                    {reel.transcriptChapters.map((chapter, chapterIndex) => (
                                      <button
                                        key={`${chapter.start}-${chapterIndex}`}
                                        type="button"
                                        onClick={() => document.getElementById(`transcript-${reel.instagramMediaId}-chapter-${chapterIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className="block w-full rounded-[var(--radius-sm)] px-3 py-2.5 text-left hover:bg-[color:var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
                                      >
                                        <span className="block text-xs tabular-nums text-[color:var(--color-accent)]">{formatTimestamp(chapter.start)}–{formatTimestamp(chapter.end)}</span>
                                        {chapter.kind === 'hook' || chapter.kind === 'cta' ? <span className="mt-1 block text-[10px] font-semibold text-[color:var(--color-text-muted)]">{chapter.kind === 'hook' ? '冒頭フック' : 'CTA'}</span> : null}
                                        <span className="mt-1 block text-sm font-medium leading-5 text-[color:var(--color-text-primary)]">{chapter.title}</span>
                                      </button>
                                    ))}
                                  </nav>
                                </aside>
                                <div className="max-h-[680px] overflow-y-auto rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
                                  {segments.map((segment, index) => {
                                    const chapterIndex = reel.transcriptChapters.findIndex((chapter) => chapterSegmentIndex(chapter, segments) === index);
                                    const chapter = chapterIndex >= 0 ? reel.transcriptChapters[chapterIndex] : null;
                                    return (
                                      <Fragment key={`${segment.start}-${index}`}>
                                        {chapter ? (
                                          <div id={`transcript-${reel.instagramMediaId}-chapter-${chapterIndex}`} className="scroll-mt-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 sm:px-5">
                                            <p className="text-xs font-medium tabular-nums text-[color:var(--color-accent)]">{formatTimestamp(chapter.start)}–{formatTimestamp(chapter.end)}</p>
                                            <h4 className="mt-1 text-base font-semibold text-[color:var(--color-text-primary)]">{chapter.title}</h4>
                                          </div>
                                        ) : null}
                                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-[color:var(--color-border)] px-4 py-3 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-5">
                                          {storedVideo ? (
                                            <a href={`${storedVideo}#t=${Math.floor(segment.start)}`} target="_blank" rel="noreferrer" className="w-fit tabular-nums font-semibold text-[color:var(--color-accent)] hover:underline">{formatTimestamp(segment.start)}</a>
                                          ) : (
                                            <span className="tabular-nums font-semibold text-[color:var(--color-accent)]">{formatTimestamp(segment.start)}</span>
                                          )}
                                          <p className="text-sm leading-7 text-[color:var(--color-text-primary)]">{segment.text}</p>
                                        </div>
                                      </Fragment>
                                    );
                                  })}
                                </div>
                              </div>
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
