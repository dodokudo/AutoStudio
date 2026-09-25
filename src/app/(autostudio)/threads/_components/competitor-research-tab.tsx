'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DailyPostCount } from '@/lib/threadsResearch';
import type { DailyViewEstimate } from '@/lib/threadsResearchDailyEstimate';
import type { PostViewPoint } from '@/lib/threadsResearchViews';
import { THREADS_RESEARCH_TARGET_USERNAMES } from '@/lib/threadsResearchTargets';
import { CompetitorDailyChart, type CompetitorDailyPoint } from './competitor-daily-chart';
import { type CompetitorHistoryPoint } from './competitor-history-chart';

/**
 * Operational competitor research workspace.
 *
 * Keyword search discovers candidates. Profile discovery explains one candidate.
 * The watchlist persists selected accounts, and collection/analysis turns their
 * public posts and self-reply trees into reusable writing patterns.
 */

type PeriodDays = 7 | 30 | 90 | 180;
type AccountView = 'overview' | 'posts' | 'structure';

interface SearchPost {
  id: string;
  username?: string;
  text?: string;
  timestamp: string;
  permalink?: string;
}

interface SearchResult {
  keyword: string;
  posts: SearchPost[];
  authors: { username: string; postCount: number }[];
  evaluatedAt: string;
  maxEvaluatedCandidates: number;
  candidates: CandidateEvaluation[];
}

type CandidateStatus = 'strong' | 'watch' | 'review' | 'unavailable';

interface CandidateEvaluation {
  username: string;
  postCount: number;
  relevantPostCount: number;
  relevanceScore: number;
  latestPostAt: string | null;
  profile: Profile | null;
  viewEfficiency: number | null;
  reactionRate: number | null;
  reactionCount: number | null;
  strengthScore: number | null;
  status: CandidateStatus;
  error: string | null;
}

interface Profile {
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  is_verified?: boolean;
  follower_count?: number;
  likes_count?: number;
  replies_count?: number;
  reposts_count?: number;
  quotes_count?: number;
  views_count?: number;
}

interface SelfReply {
  text: string;
  depth: number;
  permalink: string;
  secondsAfterRoot: number | null;
}

interface ProfilePost {
  id: string;
  text: string;
  timestamp: string;
  permalink: string;
  mediaType: string;
  textLength: number;
  hasReplies: boolean;
}

interface ProfileResult {
  profile: Profile;
  posts: ProfilePost[];
}

interface WatchlistEntry {
  username: string;
  note: string | null;
  isActive: boolean;
  addedAt: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
}

interface AccountSummary {
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  followerCount: number | null;
  viewsCount: number | null;
  likesCount: number | null;
  repliesCount: number | null;
  repostsCount: number | null;
  quotesCount: number | null;
  postCount: number;
  treePostCount: number;
  scannedPostCount: number;
  avgSelfReplies: number | null;
  avgTextLength: number | null;
  latestPostAt: string | null;
}

interface WatchlistResult {
  watchlist: WatchlistEntry[];
  summaries: AccountSummary[];
  history: CompetitorHistoryPoint[];
  dailyEstimates?: DailyViewEstimate[];
  dailyPostCounts?: DailyPostCount[];
  postViews?: PostViewPoint[];
}

interface CollectedPost {
  username: string;
  postId: string;
  text: string;
  postedAt: string;
  permalink: string;
  mediaType: string;
  isQuotePost: boolean;
  hasReplies: boolean;
  selfReplyCount: number;
  maxDepth: number;
  otherReplyCount: number;
  conversationScanned: boolean;
}

interface ResearchNode {
  rootPostId: string;
  nodeId: string;
  text: string;
  postedAt: string;
  permalink: string;
  depth: number;
  isSelfReply: boolean;
  secondsAfterRoot: number | null;
}

interface ResearchAnalysis {
  username: string;
  periodDays: number;
  postCount: number;
  summary: string;
  themes: string[];
  hookPatterns: { pattern: string; evidence: string }[];
  ctaPatterns: { pattern: string; position: string }[];
  recurringPatterns: string[];
  referencePosts: { postId: string; reason: string }[];
  contentIdeas: { title: string; angle: string }[];
  limitations: string[];
}

const numberFormat = new Intl.NumberFormat('ja-JP');
const primaryButton =
  'inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--color-text-primary)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45';
const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45';

async function responseJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || '処理に失敗しました');
  return json;
}

function normalizeUsername(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?threads\.(net|com)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '未収集';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : numberFormat.format(value);
}

function formatRatio(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ja-JP', { maximumFractionDigits });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%`;
}

const candidateStatus: Record<
  CandidateStatus,
  { label: string; className: string }
> = {
  strong: {
    label: '現在強い',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  watch: {
    label: '追跡候補',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  review: {
    label: '要確認',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  unavailable: {
    label: '取得不可',
    className: 'border-gray-200 bg-gray-50 text-gray-500',
  },
};

function formatGap(seconds: number | null): string {
  if (seconds === null) return '';
  if (seconds < 60) return `${seconds}秒後`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分後`;
  return `${Math.round(seconds / 3600)}時間後`;
}

function isWithinPeriod(iso: string, days: PeriodDays): boolean {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sixMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return dateInputValue(date);
}

function hourInTokyo(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const part = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  })
    .formatToParts(date)
    .find((item) => item.type === 'hour');
  if (!part) return null;
  const hour = Number(part.value);
  return Number.isFinite(hour) ? hour % 24 : null;
}

function engagementTotal(account: AccountSummary): number | null {
  const values = [account.likesCount, account.repliesCount, account.repostsCount, account.quotesCount];
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-0 border-l-2 px-3 py-1 ${
        accent ? 'border-[color:var(--color-accent)]' : 'border-[color:var(--color-border)]'
      }`}
    >
      <div className="text-xs text-[color:var(--color-text-secondary)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-[color:var(--color-text-secondary)]">{note}</div>}
    </div>
  );
}

function InlineError({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

const WORKSPACE_ID = 'autostudio';
const DAILY_SPIKE_THRESHOLD = 10000;
const shortDateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });
function shortDate(date: string): string {
  return shortDateFormat.format(new Date(`${date}T12:00:00+09:00`));
}
const isoDateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
function previousDayIso(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setDate(d.getDate() - 1);
  return isoDateFormat.format(d);
}
function jstDateIso(iso: string): string {
  return isoDateFormat.format(new Date(iso));
}
function dayViews(entry: CompetitorDailyPoint): number {
  return entry.actualViews ?? entry.estimatedViews ?? 0;
}
function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${numberFormat.format(value)}`;
}
function cellTitle(cell: CompetitorDailyPoint): string {
  const parts: string[] = [];
  if (cell.actualViews !== null) parts.push(`実数 ${numberFormat.format(cell.actualViews)}（その日に出した投稿の閲覧数の合計、最新の読み取り）`);
  if (cell.estimatedViews !== null) parts.push(`推定 ${numberFormat.format(cell.estimatedViews)}`);
  if (cell.deltaFromPrevious !== null) parts.push(`7日合計の前日差 ${signed(cell.deltaFromPrevious)}`);
  if (cell.estimatedViews === null && cell.deltaFromPrevious !== null) parts.push('7日前の投稿が集計から抜けたため、この日の増分は算出できません');
  return parts.join(' / ');
}
const TARGET_USERNAME_ORDER = new Map<string, number>(
  THREADS_RESEARCH_TARGET_USERNAMES.map((target, index) => [target, index])
);

export function CompetitorResearchTab() {
  const userId = WORKSPACE_ID;
  const [keyword, setKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<'KEYWORD' | 'TAG'>('KEYWORD');
  const [periodDays, setPeriodDays] = useState<PeriodDays>(180);
  const [collectFromDate, setCollectFromDate] = useState(sixMonthsAgo);
  const [collectToDate, setCollectToDate] = useState(() => dateInputValue(new Date()));
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountView, setAccountView] = useState<AccountView>('overview');
  const [openLivePostId, setOpenLivePostId] = useState<string | null>(null);
  const [liveReplies, setLiveReplies] = useState<Record<string, SelfReply[]>>({});
  const [loadingLiveReplyId, setLoadingLiveReplyId] = useState<string | null>(null);

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [history, setHistory] = useState<CompetitorHistoryPoint[]>([]);
  const [dailyEstimates, setDailyEstimates] = useState<DailyViewEstimate[]>([]);
  const [dailyPostCounts, setDailyPostCounts] = useState<DailyPostCount[]>([]);
  const [postViews, setPostViews] = useState<PostViewPoint[]>([]);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const dailyRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const dailyTableScrollRef = useRef<HTMLDivElement | null>(null);
  const [historyUsername, setHistoryUsername] = useState<string>(
    THREADS_RESEARCH_TARGET_USERNAMES[0]
  );
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [collectingUsername, setCollectingUsername] = useState<string | null>(null);
  const [collectionMessage, setCollectionMessage] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const [selectedSavedUsername, setSelectedSavedUsername] = useState<string | null>(null);
  const [collectedPosts, setCollectedPosts] = useState<CollectedPost[]>([]);
  const [loadingCollected, setLoadingCollected] = useState(false);
  const [collectedError, setCollectedError] = useState<string | null>(null);
  const [openSavedPostId, setOpenSavedPostId] = useState<string | null>(null);
  const [savedNodes, setSavedNodes] = useState<Record<string, ResearchNode[]>>({});
  const [loadingSavedPostId, setLoadingSavedPostId] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<ResearchAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const targetSummaries = useMemo(
    () =>
      summaries
        .filter((account) => TARGET_USERNAME_ORDER.has(account.username))
        .sort(
          (left, right) =>
            (TARGET_USERNAME_ORDER.get(left.username) ?? Number.MAX_SAFE_INTEGER) -
            (TARGET_USERNAME_ORDER.get(right.username) ?? Number.MAX_SAFE_INTEGER)
        ),
    [summaries]
  );

  const latestPostViews = useMemo(() => {
    const latest = new Map<string, PostViewPoint>();
    for (const view of postViews) {
      const current = latest.get(view.postId);
      if (!current || view.snapshotDate > current.snapshotDate) latest.set(view.postId, view);
    }
    return latest;
  }, [postViews]);

  const dailySeries = useMemo<CompetitorDailyPoint[]>(() => {
    const byKey = new Map<string, CompetitorDailyPoint>();
    const point = (username: string, postDate: string) => {
      const key = `${username}|${postDate}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { username, postDate, estimatedViews: null, followerDelta: null, postCount: 0, seeded: false, deltaFromPrevious: null, actualViews: null };
        byKey.set(key, entry);
      }
      return entry;
    };
    for (const estimate of dailyEstimates) {
      if (estimate.deltaFromPrevious === null) continue;
      const entry = point(estimate.username, previousDayIso(estimate.snapshotDate));
      entry.estimatedViews = estimate.estimatedViews;
      entry.deltaFromPrevious = estimate.deltaFromPrevious;
      entry.seeded = estimate.seeded;
    }
    const followers = new Map<string, CompetitorHistoryPoint[]>();
    for (const snapshot of history) {
      if (snapshot.followerCount === null) continue;
      const list = followers.get(snapshot.username) ?? [];
      list.push(snapshot);
      followers.set(snapshot.username, list);
    }
    for (const [username, list] of followers) {
      list.sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate));
      for (let index = 1; index < list.length; index += 1) {
        const entry = point(username, previousDayIso(list[index].snapshotDate));
        entry.followerDelta = (list[index].followerCount ?? 0) - (list[index - 1].followerCount ?? 0);
      }
    }
    for (const [, view] of latestPostViews) {
      if (view.viewsCount === null) continue;
      const entry = point(view.username, view.postDate);
      entry.actualViews = (entry.actualViews ?? 0) + view.viewsCount;
    }
    for (const count of dailyPostCounts) {
      point(count.username, count.postDate).postCount = count.postCount;
    }
    return [...byKey.values()].sort(
      (left, right) => left.postDate.localeCompare(right.postDate) || left.username.localeCompare(right.username)
    );
  }, [dailyEstimates, dailyPostCounts, history, latestPostViews]);

  const dailyEstimateTable = useMemo(() => {
    const withViews = dailySeries.filter((entry) => entry.actualViews !== null || entry.estimatedViews !== null || entry.deltaFromPrevious !== null);
    const firstDate = withViews.length > 0 ? withViews.map((entry) => entry.postDate).sort()[0] : null;
    const dates = [...new Set(dailySeries.map((entry) => entry.postDate))].filter((date) => !firstDate || date >= firstDate).sort();
    const rows = THREADS_RESEARCH_TARGET_USERNAMES.map((username) => ({
      username,
      cells: new Map(
        dailySeries.filter((entry) => entry.username === username).map((entry) => [entry.postDate, entry] as const)
      ),
    }));
    const spikes = dailySeries
      .filter((entry) => dayViews(entry) >= DAILY_SPIKE_THRESHOLD)
      .sort((left, right) => dayViews(right) - dayViews(left))
      .slice(0, 10);
    return { dates, rows, spikes };
  }, [dailySeries]);

  const selectedDaily = useMemo(
    () => dailySeries.filter((entry) => entry.username === historyUsername && dailyEstimateTable.dates.includes(entry.postDate)),
    [dailySeries, historyUsername, dailyEstimateTable.dates]
  );

  const selectedDailyPosts = useMemo(() => {
    if (selectedSavedUsername !== historyUsername) return new Map<string, CollectedPost[]>();
    const grouped = new Map<string, CollectedPost[]>();
    for (const post of collectedPosts) {
      if (post.isQuotePost) continue;
      const key = jstDateIso(post.postedAt);
      const list = grouped.get(key) ?? [];
      list.push(post);
      grouped.set(key, list);
    }
    for (const list of grouped.values()) {
      list.sort((left, right) => right.otherReplyCount - left.otherReplyCount);
    }
    return grouped;
  }, [collectedPosts, historyUsername, selectedSavedUsername]);

  const loadWatchlist = useCallback(async () => {
    setLoadingWatchlist(true);
    setWatchlistError(null);
    try {
      const params = new URLSearchParams({ userId });
      const result = await responseJson<WatchlistResult>(
        await fetch(`/api/threads/research/watchlist?${params.toString()}`)
      );
      setWatchlist(result.watchlist);
      setSummaries(result.summaries);
      setHistory(result.history ?? []);
      setDailyEstimates(result.dailyEstimates ?? []);
      setDailyPostCounts(result.dailyPostCounts ?? []);
      setPostViews(result.postViews ?? []);
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingWatchlist(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    const el = dailyTableScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dailyEstimateTable.dates.length]);

  useEffect(() => {
    if (!focusDate || loadingCollected) return;
    const row = dailyRowRefs.current[focusDate];
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusDate, loadingCollected, selectedSavedUsername]);

  const loadCollectedAccount = useCallback(
    async (target: string) => {
      const clean = normalizeUsername(target);
      setSelectedSavedUsername(clean);
      setLoadingCollected(true);
      setCollectedError(null);
      setOpenSavedPostId(null);
      setSavedNodes({});
      setAnalysis(null);
      setAnalysisError(null);
      try {
        const params = new URLSearchParams({
          userId,
          username: clean,
          limit: '5000',
          fromDate: collectFromDate,
          toDate: collectToDate,
        });
        const result = await responseJson<{ posts: CollectedPost[] }>(
          await fetch(`/api/threads/research/posts?${params.toString()}`)
        );
        setCollectedPosts(result.posts);
      } catch (error) {
        setCollectedError(error instanceof Error ? error.message : String(error));
        setCollectedPosts([]);
      } finally {
        setLoadingCollected(false);
      }
    },
    [collectFromDate, collectToDate, userId]
  );

  const lookupProfile = async (target: string, nextView: AccountView = 'overview') => {
    const clean = normalizeUsername(target);
    if (!clean) return;
    setAccountView(nextView);
    setUsername(clean);
    setLoadingProfile(true);
    setProfileError(null);
    setOpenLivePostId(null);
    setLiveReplies({});
    setCollectionMessage(null);
    setCollectionError(null);
    try {
      const params = new URLSearchParams({ userId, username: clean });
      const result = await responseJson<ProfileResult>(
        await fetch(`/api/threads/research/profile?${params.toString()}`)
      );
      setProfileResult(result);
      if (watchlist.some((entry) => entry.username === result.profile.username)) {
        void loadCollectedAccount(result.profile.username);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : String(error));
      setProfileResult(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    setProfileResult(null);
    setUsername('');
    setAccountView('overview');
    try {
      const params = new URLSearchParams({
        userId,
        q: keyword.trim(),
        mode: searchMode,
        days: String(periodDays),
      });
      const result = await responseJson<SearchResult>(
        await fetch(`/api/threads/research/search?${params.toString()}`)
      );
      setSearchResult(result);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  };

  const toggleLiveReplies = async (post: ProfilePost) => {
    if (openLivePostId === post.id) {
      setOpenLivePostId(null);
      return;
    }
    setOpenLivePostId(post.id);
    if (liveReplies[post.id]) return;
    setLoadingLiveReplyId(post.id);
    try {
      const params = new URLSearchParams({
        userId,
        postId: post.id,
        username: profileResult?.profile.username ?? username,
        postedAt: post.timestamp,
      });
      const result = await responseJson<{ replies: SelfReply[] }>(
        await fetch(`/api/threads/research/thread?${params.toString()}`)
      );
      setLiveReplies((previous) => ({ ...previous, [post.id]: result.replies ?? [] }));
    } catch {
      setLiveReplies((previous) => ({ ...previous, [post.id]: [] }));
    } finally {
      setLoadingLiveReplyId(null);
    }
  };

  const collectAccount = async (target: string) => {
    const clean = normalizeUsername(target);
    if (!clean) return;
    setCollectingUsername(clean);
    setCollectionMessage(null);
    setCollectionError(null);
    try {
      if (!watchlist.some((entry) => entry.username === clean)) {
        await responseJson<{ username: string }>(
          await fetch('/api/threads/research/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username: clean, note: keyword.trim() }),
          })
        );
      }
      const result = await responseJson<{
        results: {
          username: string;
          ok: boolean;
          postCount: number;
          selfReplyCount: number;
          oldestPostAt: string | null;
          latestPostAt: string | null;
          error: string | null;
        }[];
      }>(
        await fetch('/api/threads/research/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            username: clean,
            fromDate: collectFromDate,
            toDate: collectToDate,
            includeConversations: true,
          }),
        })
      );
      const account = result.results.find((item) => item.username === clean);
      if (!account?.ok) throw new Error(account?.error || '収集に失敗しました');
      setCollectionMessage(
        `${account.postCount}件の投稿と${account.selfReplyCount}件のツリー返信を保存しました（${formatDateTime(account.oldestPostAt)}〜${formatDateTime(account.latestPostAt)}）`
      );
      await Promise.all([loadWatchlist(), loadCollectedAccount(clean)]);
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setCollectingUsername(null);
    }
  };

  const selectSavedAccount = async (target: string) => {
    await Promise.all([lookupProfile(target, 'structure'), loadCollectedAccount(target)]);
  };

  const toggleSavedReplies = async (post: CollectedPost) => {
    if (openSavedPostId === post.postId) {
      setOpenSavedPostId(null);
      return;
    }
    setOpenSavedPostId(post.postId);
    if (savedNodes[post.postId]) return;
    setLoadingSavedPostId(post.postId);
    try {
      const params = new URLSearchParams({ userId, postId: post.postId });
      const result = await responseJson<{ nodes: ResearchNode[] }>(
        await fetch(`/api/threads/research/posts?${params.toString()}`)
      );
      setSavedNodes((previous) => ({
        ...previous,
        [post.postId]: result.nodes.filter((node) => node.isSelfReply),
      }));
    } catch {
      setSavedNodes((previous) => ({ ...previous, [post.postId]: [] }));
    } finally {
      setLoadingSavedPostId(null);
    }
  };

  const runAnalysis = async () => {
    if (!selectedSavedUsername) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await responseJson<{ analysis: ResearchAnalysis }>(
        await fetch('/api/threads/research/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, username: selectedSavedUsername, periodDays }),
        })
      );
      setAnalysis(result.analysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredSearchPosts = useMemo(
    () => searchResult?.posts.filter((post) => isWithinPeriod(post.timestamp, periodDays)) ?? [],
    [periodDays, searchResult]
  );

  const candidateAuthors = useMemo(() => {
    return searchResult?.candidates ?? [];
  }, [searchResult]);

  const profile = profileResult?.profile;
  const profilePosts = useMemo(
    () => profileResult?.posts.filter((post) => isWithinPeriod(post.timestamp, periodDays)) ?? [],
    [periodDays, profileResult]
  );
  const selectedHitCount = candidateAuthors.find((item) => item.username === profile?.username)?.postCount ?? 0;
  const isProfileSaved = profile ? watchlist.some((entry) => entry.username === profile.username) : false;

  const visibleCollectedPosts = useMemo(
    () => collectedPosts.filter((post) => isWithinPeriod(post.postedAt, periodDays)),
    [collectedPosts, periodDays]
  );

  const structureSummary = useMemo(() => {
    if (visibleCollectedPosts.length === 0) return null;
    const treePosts = visibleCollectedPosts.filter((post) => post.selfReplyCount > 0);
    const totalLength = visibleCollectedPosts.reduce((sum, post) => sum + [...post.text].length, 0);
    const totalReplies = visibleCollectedPosts.reduce((sum, post) => sum + post.selfReplyCount, 0);
    const hourCounts = new Map<number, number>();
    for (const post of visibleCollectedPosts) {
      const hour = hourInTokyo(post.postedAt);
      if (hour === null) continue;
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    const topHour = Array.from(hourCounts).sort((left, right) => right[1] - left[1])[0]?.[0];
    return {
      postCount: visibleCollectedPosts.length,
      treeRate: Math.round((treePosts.length / visibleCollectedPosts.length) * 100),
      avgLength: Math.round(totalLength / visibleCollectedPosts.length),
      avgReplies: (totalReplies / visibleCollectedPosts.length).toFixed(1),
      topHour,
    };
  }, [visibleCollectedPosts]);

  const referencePostMap = useMemo(
    () => new Map(collectedPosts.map((post) => [post.postId, post])),
    [collectedPosts]
  );

  const structurePanel = selectedSavedUsername ? (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
            保存済み投稿の構成
          </h5>
          <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
            過去{periodDays}日・保存済みデータ
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={analyzing || visibleCollectedPosts.length === 0}
          className={primaryButton}
        >
          {analyzing ? 'AI分析中…' : 'AIで構成を分析'}
        </button>
      </div>

      {loadingCollected && (
        <p className="mt-6 text-sm text-[color:var(--color-text-secondary)]">
          保存済み投稿を読み込んでいます…
        </p>
      )}
      {collectedError && <div className="mt-5"><InlineError>{collectedError}</InlineError></div>}
      {!loadingCollected && !collectedError && visibleCollectedPosts.length === 0 && (
        <p className="mt-5 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-4 py-6 text-sm text-[color:var(--color-text-secondary)]">
          この期間の保存済み投稿がありません。概要から最新データを収集してください。
        </p>
      )}
      {structureSummary && (
        <div className="mt-5 grid grid-cols-2 gap-y-4 border-y border-[color:var(--color-border)] py-4 sm:grid-cols-5">
          <Metric label="分析対象" value={`${structureSummary.postCount}件`} accent />
          <Metric label="ツリー投稿率" value={`${structureSummary.treeRate}%`} />
          <Metric label="平均ツリー返信" value={`${structureSummary.avgReplies}件`} />
          <Metric label="平均本文文字数" value={`${structureSummary.avgLength}字`} />
          <Metric label="最多投稿時間" value={structureSummary.topHour === undefined ? '—' : `${structureSummary.topHour}時台`} />
        </div>
      )}

      {analysisError && <div className="mt-5"><InlineError>{analysisError}</InlineError></div>}
      {analysis && (
        <div className="mt-6 border-l-4 border-[color:var(--color-accent)] pl-4 sm:pl-5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-[color:var(--color-text-primary)]">AI構成分析</h4>
            <span className="text-xs text-[color:var(--color-text-secondary)]">{analysis.postCount}件を分析</span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-[color:var(--color-text-primary)]">{analysis.summary}</p>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">よく扱うテーマ</h5>
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.themes.map((theme) => <span key={theme} className="rounded-full bg-[color:var(--color-surface-muted)] px-3 py-1 text-xs text-[color:var(--color-text-primary)]">{theme}</span>)}
              </div>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">繰り返している型</h5>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-[color:var(--color-text-primary)]">
                {analysis.recurringPatterns.map((pattern) => <li key={pattern} className="flex gap-2"><span aria-hidden="true" className="text-[color:var(--color-accent)]">—</span><span>{pattern}</span></li>)}
              </ul>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">冒頭のパターン</h5>
              <div className="mt-2 space-y-3">
                {analysis.hookPatterns.map((item) => (
                  <div key={`${item.pattern}-${item.evidence}`}>
                    <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{item.pattern}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-text-secondary)]">{item.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">CTAの置き方</h5>
              <div className="mt-2 space-y-3">
                {analysis.ctaPatterns.map((item) => (
                  <div key={`${item.pattern}-${item.position}`}>
                    <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{item.pattern}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-text-secondary)]">{item.position}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">自分の投稿に使える企画</h5>
            <div className="mt-2 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
              {analysis.contentIdeas.map((idea) => (
                <div key={idea.title} className="py-3 sm:grid sm:grid-cols-[220px_1fr] sm:gap-4">
                  <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{idea.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-secondary)] sm:mt-0">{idea.angle}</p>
                </div>
              ))}
            </div>
          </div>

          {analysis.referencePosts.length > 0 && (
            <div className="mt-6">
              <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">参考にする投稿</h5>
              <div className="mt-2 space-y-2">
                {analysis.referencePosts.map((item) => {
                  const post = referencePostMap.get(item.postId);
                  return (
                    <div key={item.postId} className="rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-3 py-3">
                      <p className="line-clamp-2 text-sm text-[color:var(--color-text-primary)]">{post?.text || item.postId}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                        <span>{item.reason}</span>
                        {post?.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-accent)] hover:underline">Threadsで開く</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {analysis.limitations.length > 0 && (
            <p className="mt-5 text-xs leading-5 text-[color:var(--color-text-secondary)]">分析上の注意：{analysis.limitations.join(' / ')}</p>
          )}
        </div>
      )}

      {visibleCollectedPosts.length > 0 && (
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)]">保存済み投稿</h4>
            <span className="text-xs text-[color:var(--color-text-secondary)]">{visibleCollectedPosts.length}件</span>
          </div>
          <div className="max-h-[720px] divide-y divide-[color:var(--color-border)] overflow-y-auto border-y border-[color:var(--color-border)]">
            {visibleCollectedPosts.map((post) => (
              <article key={post.postId} className="py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">
                  <span>{formatDateTime(post.postedAt)}</span>
                  <span>{[...post.text].length}字</span>
                  {post.selfReplyCount > 0 && <span className="font-medium text-[color:var(--color-accent)]">ツリー返信 {post.selfReplyCount}件・最大{post.maxDepth}段</span>}
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-accent)] hover:underline">Threadsで開く</a>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">{post.text || '（本文なし）'}</p>
                {post.selfReplyCount > 0 && (
                  <button type="button" onClick={() => void toggleSavedReplies(post)} className="mt-2 text-xs font-medium text-[color:var(--color-accent)] hover:underline">
                    {openSavedPostId === post.postId ? 'ツリーを閉じる' : '保存したツリーを読む'}
                  </button>
                )}
                {openSavedPostId === post.postId && (
                  <div className="mt-3 space-y-3 border-l-2 border-[color:var(--color-border)] pl-4">
                    {loadingSavedPostId === post.postId && <p className="text-xs text-[color:var(--color-text-secondary)]">読み込み中…</p>}
                    {loadingSavedPostId !== post.postId && !savedNodes[post.postId]?.length && <p className="text-xs text-[color:var(--color-text-secondary)]">保存済みのツリー返信はありません。</p>}
                    {savedNodes[post.postId]?.map((node) => (
                      <div key={node.nodeId}>
                        <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{node.depth}段目・{formatGap(node.secondsAfterRoot)}</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">{node.text || '（本文なし）'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-tight text-[color:var(--color-text-primary)]">
            競合リサーチ
          </h2>
          <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-secondary)]">
            テーマから参考アカウントを見つけ、公開投稿とツリー投稿の作り方を調べます。
          </p>
        </div>

        <form onSubmit={runSearch} className="mt-5 grid gap-3 lg:grid-cols-[minmax(280px,1fr)_140px_140px_112px] lg:items-end">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-secondary)]">
              テーマ・キーワード
            </span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="例：Threads運用、インスタ集客"
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] placeholder:text-gray-400 focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-secondary)]">
              検索方法
            </span>
            <select
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value as 'KEYWORD' | 'TAG')}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none"
            >
              <option value="KEYWORD">キーワード</option>
              <option value="TAG">トピックタグ</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-secondary)]">
              表示・分析期間
            </span>
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value) as PeriodDays)}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none"
            >
              <option value={7}>過去7日</option>
              <option value={30}>過去30日</option>
              <option value={90}>過去90日</option>
              <option value={180}>過去180日</option>
            </select>
          </label>
          <button type="submit" disabled={searching || !keyword.trim()} className={`${primaryButton} h-11`}>
            {searching ? '候補を評価中…' : '競合を探す'}
          </button>
        </form>

        <details className="mt-4 border-t border-[color:var(--color-border)] pt-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]">
            usernameから直接調べる
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearchResult(null);
              setSearchError(null);
              void lookupProfile(username);
            }}
            className="mt-3 flex max-w-xl flex-col gap-2 sm:flex-row"
          >
            <input
              aria-label="Threads username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@username またはプロフィールURL"
              className="h-10 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none"
            />
            <button type="submit" disabled={loadingProfile || !username.trim()} className={secondaryButton}>
              {loadingProfile ? '取得中…' : 'アカウントを見る'}
            </button>
          </form>
        </details>
        {searchError && <div className="mt-4"><InlineError>{searchError}</InlineError></div>}
      </section>

      {(searchResult || loadingProfile || profileResult || profileError) && (
        <section className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          <div className="border-b border-[color:var(--color-border)] px-5 py-4">
            <h3 className="font-bold text-[color:var(--color-text-primary)]">
              {searchResult ? '調査結果' : 'アカウント分析'}
            </h3>
            {searchResult && (
              <div className="mt-1 space-y-1 text-xs text-[color:var(--color-text-secondary)]">
                <p>
                  「{searchResult.keyword}」・過去{periodDays}日：候補 {candidateAuthors.length}アカウント / 該当投稿 {filteredSearchPosts.length}件
                </p>
                <p>
                  上位{searchResult.maxEvaluatedCandidates}件まで、7日閲覧・フォロワー効率・反応率・関連性で自動評価。数値取得 {formatDateTime(searchResult.evaluatedAt)}
                </p>
              </div>
            )}
          </div>

          <div className={searchResult ? 'grid min-h-[360px] lg:grid-cols-[360px_minmax(0,1fr)]' : 'min-h-[360px]'}>
            {searchResult && (
            <div className="border-b border-[color:var(--color-border)] lg:border-b-0 lg:border-r">
              <div className="border-b border-[color:var(--color-border)] px-4 py-3 text-xs font-medium text-[color:var(--color-text-secondary)]">
                参考アカウント候補
              </div>
              {searchResult && candidateAuthors.length === 0 && (
                <p className="px-4 py-8 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                  この期間に該当する公開投稿がありません。期間を広げるか、別のキーワードを試してください。
                </p>
              )}
              <div className="max-h-[560px] divide-y divide-[color:var(--color-border)] overflow-y-auto">
                {candidateAuthors.map((candidate, index) => {
                  const matchingPost = filteredSearchPosts.find(
                    (post) => normalizeUsername(post.username ?? '') === candidate.username
                  );
                  const selected = profile?.username === candidate.username;
                  return (
                    <button
                      key={candidate.username}
                      type="button"
                      disabled={candidate.status === 'unavailable'}
                      onClick={() => void lookupProfile(candidate.username)}
                      className={`w-full px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? 'bg-[color:rgba(10,122,255,0.08)]'
                          : 'enabled:hover:bg-[color:var(--color-surface-muted)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-[color:var(--color-text-secondary)]">
                              {index + 1}
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold text-[color:var(--color-text-primary)]">
                              @{candidate.username}
                            </span>
                          </div>
                          {candidate.profile?.name && (
                            <p className="mt-0.5 truncate pl-7 text-xs text-[color:var(--color-text-secondary)]">
                              {candidate.profile.name}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${candidateStatus[candidate.status].className}`}
                          >
                            {candidateStatus[candidate.status].label}
                          </span>
                          {candidate.strengthScore !== null && (
                            <span className="w-8 text-right text-sm font-bold tabular-nums text-[color:var(--color-text-primary)]">
                              {candidate.strengthScore}
                            </span>
                          )}
                        </div>
                      </div>
                      {candidate.profile ? (
                        <div className="mt-3 grid grid-cols-3 gap-2 pl-7">
                          <div>
                            <div className="text-[10px] text-[color:var(--color-text-secondary)]">7日閲覧</div>
                            <div className="mt-0.5 text-xs font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                              {formatMetric(candidate.profile.views_count)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[color:var(--color-text-secondary)]">閲覧 / F</div>
                            <div className="mt-0.5 text-xs font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                              {formatRatio(candidate.viewEfficiency)}倍
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[color:var(--color-text-secondary)]">反応 / 閲覧</div>
                            <div className="mt-0.5 text-xs font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                              {formatPercent(candidate.reactionRate)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 pl-7 text-xs text-[color:var(--color-text-secondary)]">
                          公開プロフィールの数値を取得できませんでした
                        </p>
                      )}
                      {matchingPost?.text && (
                        <p className="mt-2 line-clamp-2 pl-7 text-xs leading-5 text-[color:var(--color-text-secondary)]">
                          {matchingPost.text}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[10px] text-[color:var(--color-text-secondary)]">
                        <span>該当 {candidate.postCount}件</span>
                        <span>関連性 {candidate.relevanceScore}</span>
                        {candidate.latestPostAt && <span>最新 {formatDateTime(candidate.latestPostAt)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            <div className="min-w-0 p-5 sm:p-6">
              {loadingProfile && (
                <div className="flex min-h-64 items-center justify-center text-sm text-[color:var(--color-text-secondary)]">
                  公開プロフィールと投稿を取得しています…
                </div>
              )}
              {profileError && <InlineError>{profileError}</InlineError>}
              {!loadingProfile && !profile && !profileError && (
                <div className="flex min-h-64 items-center justify-center text-center">
                  <div>
                    <p className="font-medium text-[color:var(--color-text-primary)]">候補を選んで詳細を見る</p>
                    <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                      ランキングは現在の強さです。候補を選ぶと公開投稿と詳細を確認できます。
                    </p>
                    <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
                      過去7日間はMetaが取得時点で返す集計値です。境界時刻と反映遅延は公表されていません。
                    </p>
                  </div>
                </div>
              )}
              {!loadingProfile && profile && (
                <div className="space-y-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 items-start gap-3">
                      {profile.profile_picture_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.profile_picture_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-[color:var(--color-text-primary)]">
                            {profile.name || profile.username}
                          </h4>
                          {profile.is_verified && (
                            <span className="text-xs font-medium text-[color:var(--color-accent)]">認証済み</span>
                          )}
                        </div>
                        <div className="text-sm text-[color:var(--color-text-secondary)]">@{profile.username}</div>
                        {profile.biography && (
                          <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">
                            {profile.biography}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={collectingUsername === profile.username}
                      onClick={() => void collectAccount(profile.username)}
                      className={`${primaryButton} shrink-0`}
                    >
                      {collectingUsername === profile.username
                        ? '収集中…'
                        : isProfileSaved
                          ? '指定期間を再収集'
                          : '保存して期間収集'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 border-y border-[color:var(--color-border)] py-4 sm:grid-cols-3 xl:grid-cols-6">
                    <Metric label="7日間の閲覧" value={formatMetric(profile.views_count)} accent />
                    <Metric label="7日間のいいね" value={formatMetric(profile.likes_count)} />
                    <Metric label="7日間の返信" value={formatMetric(profile.replies_count)} />
                    <Metric label="7日間の再投稿" value={formatMetric(profile.reposts_count)} />
                    <Metric label="7日間の引用" value={formatMetric(profile.quotes_count)} />
                    <Metric label="フォロワー" value={formatMetric(profile.follower_count)} note="現在値" />
                  </div>

                  <div
                    role="tablist"
                    aria-label="アカウント分析の表示内容"
                    className="flex gap-6 border-b border-[color:var(--color-border)]"
                  >
                    {([
                      { key: 'overview' as const, label: '概要' },
                      { key: 'posts' as const, label: `公開投稿 ${profilePosts.length}` },
                      { key: 'structure' as const, label: '投稿構成', disabled: !isProfileSaved },
                    ]).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={accountView === tab.key}
                        disabled={tab.disabled}
                        title={tab.disabled ? '保存して期間収集すると確認できます' : undefined}
                        onClick={() => setAccountView(tab.key)}
                        className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 ${
                          accountView === tab.key
                            ? 'border-[color:var(--color-accent)] text-[color:var(--color-text-primary)]'
                            : 'border-transparent text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {accountView === 'overview' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-4 py-4">
                        <div className="max-w-xl">
                          <p className="text-sm font-medium text-[color:var(--color-text-primary)]">収集する期間</p>
                          <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">
                            上の数値はアカウント全体の過去7日間合計です。投稿別の閲覧・反応数ではありません。
                          </p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs text-[color:var(--color-text-secondary)]">
                            <span className="mb-1 block">開始日</span>
                            <input
                              type="date"
                              value={collectFromDate}
                              max={collectToDate}
                              onChange={(event) => setCollectFromDate(event.target.value)}
                              className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 text-xs text-[color:var(--color-text-primary)]"
                            />
                          </label>
                          <label className="text-xs text-[color:var(--color-text-secondary)]">
                            <span className="mb-1 block">終了日</span>
                            <input
                              type="date"
                              value={collectToDate}
                              min={collectFromDate}
                              onChange={(event) => setCollectToDate(event.target.value)}
                              className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 text-xs text-[color:var(--color-text-primary)]"
                            />
                          </label>
                        </div>
                      </div>

                      {selectedHitCount > 0 && (
                        <div className="rounded-[var(--radius-sm)] border-l-2 border-[color:var(--color-accent)] bg-[color:var(--color-surface-muted)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]">
                          「{searchResult?.keyword}」に該当する投稿が過去{periodDays}日で {selectedHitCount}件見つかりました。
                        </div>
                      )}
                      {!isProfileSaved && (
                        <p className="text-xs leading-5 text-[color:var(--color-text-secondary)]">
                          「保存して期間収集」を実行すると、投稿構成とツリー返信を同じ画面で分析できます。
                        </p>
                      )}
                      {collectionMessage && <p className="text-sm font-medium text-emerald-700">{collectionMessage}</p>}
                      {collectionError && <InlineError>{collectionError}</InlineError>}
                    </div>
                  )}

                  {accountView === 'posts' && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                        過去{periodDays}日の公開投稿
                      </h5>
                      <span className="text-xs text-[color:var(--color-text-secondary)]">{profilePosts.length}件表示</span>
                    </div>
                    {profilePosts.length === 0 ? (
                      <p className="rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-3 py-5 text-sm text-[color:var(--color-text-secondary)]">
                        この期間に取得できた投稿はありません。
                      </p>
                    ) : (
                      <div className="max-h-[420px] divide-y divide-[color:var(--color-border)] overflow-y-auto border-y border-[color:var(--color-border)]">
                        {profilePosts.map((post) => (
                          <article key={post.id} className="py-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">
                              <span>{formatDateTime(post.timestamp)}</span>
                              <span>{post.textLength}字</span>
                              {post.mediaType && post.mediaType !== 'TEXT_POST' && <span>{post.mediaType}</span>}
                              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-accent)] hover:underline">
                                Threadsで開く
                              </a>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">
                              {post.text || '（本文なし）'}
                            </p>
                            {post.hasReplies && (
                              <button type="button" onClick={() => void toggleLiveReplies(post)} className="mt-2 text-xs font-medium text-[color:var(--color-accent)] hover:underline">
                                {openLivePostId === post.id ? 'ツリーを閉じる' : 'ツリーを読む'}
                              </button>
                            )}
                            {openLivePostId === post.id && (
                              <div className="mt-3 space-y-3 border-l-2 border-[color:var(--color-border)] pl-4">
                                {loadingLiveReplyId === post.id && <p className="text-xs text-[color:var(--color-text-secondary)]">読み込み中…</p>}
                                {loadingLiveReplyId !== post.id && !liveReplies[post.id]?.length && <p className="text-xs text-[color:var(--color-text-secondary)]">本人がつないだツリー返信はありません。</p>}
                                {liveReplies[post.id]?.map((reply, index) => (
                                  <div key={`${reply.permalink}-${index}`}>
                                    <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{reply.depth}段目・{formatGap(reply.secondsAfterRoot)}</div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">{reply.text || '（本文なし）'}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {accountView === 'structure' && structurePanel}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-4">
          <div>
            <h3 className="font-bold text-[color:var(--color-text-primary)]">調査対象の8アカウント</h3>
            <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">指定した8人だけを、アカウント全体の7日間値と保存済み投稿の構成で比較します。</p>
          </div>
          <button type="button" onClick={() => void loadWatchlist()} disabled={loadingWatchlist} className={secondaryButton}>
            {loadingWatchlist ? '更新中…' : '一覧を更新'}
          </button>
        </div>
        {watchlistError && <div className="p-5"><InlineError>{watchlistError}</InlineError></div>}
        {!watchlistError && !loadingWatchlist && targetSummaries.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="font-medium text-[color:var(--color-text-primary)]">保存した競合はまだありません</p>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">上の検索結果からアカウントを選び、「保存して収集」を実行してください。</p>
          </div>
        )}
        {targetSummaries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] text-xs text-[color:var(--color-text-secondary)]">
                <tr>
                  <th className="px-5 py-3 font-medium">アカウント</th>
                  <th className="px-3 py-3 text-right font-medium">フォロワー</th>
                  <th className="px-3 py-3 text-right font-medium">7日間閲覧</th>
                  <th className="px-3 py-3 text-right font-medium">7日間反応</th>
                  <th className="px-3 py-3 text-right font-medium">保存投稿</th>
                  <th className="px-3 py-3 text-right font-medium">ツリー確認</th>
                  <th className="px-3 py-3 font-medium">最終収集</th>
                  <th className="px-5 py-3"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {targetSummaries.map((account) => {
                  const entry = watchlist.find((item) => item.username === account.username);
                  const selected = selectedSavedUsername === account.username;
                  return (
                    <tr key={account.username} className={selected ? 'bg-[color:rgba(10,122,255,0.06)]' : ''}>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => void selectSavedAccount(account.username)} className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:underline">
                          {account.profilePictureUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={account.profilePictureUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                          )}
                          <span>
                            <span className="block font-semibold text-[color:var(--color-text-primary)]">{account.name || `@${account.username}`}</span>
                            <span className="block text-xs text-[color:var(--color-text-secondary)]">@{account.username}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-primary)]">{formatMetric(account.followerCount)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[color:var(--color-text-primary)]">{formatMetric(account.viewsCount)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-primary)]">{formatMetric(engagementTotal(account))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-primary)]">{account.postCount}件</td>
                      <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-primary)]">
                        <span className="block">ツリー {account.treePostCount}件</span>
                        <span className="block text-[11px] text-[color:var(--color-text-secondary)]">
                          {account.scannedPostCount === account.postCount
                            ? '全投稿を確認済み'
                            : account.scannedPostCount === 0
                              ? '返信は未確認'
                              : `${account.scannedPostCount}/${account.postCount}件を確認済み`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-[color:var(--color-text-secondary)]">{formatDateTime(entry?.lastCollectedAt ?? null)}</td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => void selectSavedAccount(account.username)} className="text-sm font-medium text-[color:var(--color-accent)] hover:underline">分析を見る</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-bold text-[color:var(--color-text-primary)]">日別の推移</h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">
              1日ごとの閲覧数（その日に出した投稿の実数、未収集日は推定）と投稿数です。
            </p>
          </div>
          <span className="text-xs text-[color:var(--color-text-secondary)]">毎日 4:15 JST 自動更新</span>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {THREADS_RESEARCH_TARGET_USERNAMES.map((target) => {
            const summary = targetSummaries.find((account) => account.username === target);
            const selected = historyUsername === target;
            return (
              <button
                key={target}
                type="button"
                onClick={() => setHistoryUsername(target)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white'
                    : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                {summary?.name || `@${target}`}
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <CompetitorDailyChart data={selectedDaily} />
        </div>
        <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
          {selectedDaily.length === 0
            ? '2回目の自動収集後から日別の値が出ます。'
            : `${selectedDaily.length}日分を表示しています。最初の1週間の閲覧数は起点の仮定に依存するため粗めです。`}
        </p>
      </section>

      <section className="min-w-0 max-w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-bold text-[color:var(--color-text-primary)]">日別の閲覧数 / 投稿数</h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">
              セルは「その日に出した投稿の閲覧数の合計 / 投稿数」。閲覧数は投稿ページの表示（「表示2.8万回」）を毎朝読み取った実数で、丸めあり。
              実数が未収集の日は7日合計からの推定（「推定」付き）を出し、推定できない日は「不明」です。アカウント名を押すと、上のグラフと日別の投稿一覧に切り替わります。
            </p>
          </div>
          <span className="text-xs text-[color:var(--color-text-secondary)]">毎日 4:15 JST 自動更新</span>
        </div>

        {dailyEstimateTable.dates.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--color-text-secondary)]">2日分以上のスナップショットが溜まると表示されます。</p>
        ) : (
          <>
            <div ref={dailyTableScrollRef} className="mt-4 w-0 min-w-full overflow-x-auto">
              <table className="min-w-[720px] text-left text-xs">
                <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-secondary)]">
                  <tr>
                    <th className="sticky left-0 z-10 bg-[color:var(--color-surface-muted)] px-3 py-2 font-medium">アカウント</th>
                    {dailyEstimateTable.dates.map((date) => (
                      <th key={date} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                        {shortDate(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailyEstimateTable.rows.map((row) => (
                    <tr key={row.username} className="border-b border-[color:var(--color-border)]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-[color:var(--color-surface)] px-3 py-2 font-medium text-[color:var(--color-text-primary)]">
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryUsername(row.username);
                            setFocusDate(null);
                            void selectSavedAccount(row.username);
                          }}
                          className={`underline-offset-2 hover:underline ${historyUsername === row.username ? 'text-[color:var(--color-accent)]' : ''}`}
                        >
                          @{row.username}
                        </button>
                      </td>
                      {dailyEstimateTable.dates.map((date) => {
                        const cell = row.cells.get(date);
                        const actual = cell?.actualViews ?? null;
                        const value = actual ?? cell?.estimatedViews ?? null;
                        const spike = value !== null && value >= DAILY_SPIKE_THRESHOLD;
                        return (
                          <td
                            key={date}
                            title={cell ? cellTitle(cell) : undefined}
                            className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                              spike
                                ? 'bg-amber-100 font-bold text-amber-900'
                                : actual === null && cell?.seeded
                                  ? 'text-[color:var(--color-text-secondary)]'
                                  : 'text-[color:var(--color-text-primary)]'
                            }`}
                          >
                            {value === null ? (cell?.deltaFromPrevious !== null && cell?.deltaFromPrevious !== undefined ? <span className="text-[color:var(--color-text-secondary)]">不明</span> : '–') : numberFormat.format(value)}
                            {actual === null && value !== null && <span className="ml-0.5 text-[10px] text-[color:var(--color-text-secondary)]">推定</span>}
                            <span className="ml-1 text-[10px] text-[color:var(--color-text-secondary)]">/ {cell?.postCount ?? 0}本</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
              黄色は1万以上。左にスクロールすると過去の日付が見られます。セルにカーソルを合わせると内訳（実数・推定・前日差）が出ます。
            </p>
            {dailyEstimateTable.spikes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-bold text-[color:var(--color-text-primary)]">跳ねた日（1万以上）</h4>
                <ul className="mt-2 space-y-1 text-sm text-[color:var(--color-text-primary)]">
                  {dailyEstimateTable.spikes.map((point) => (
                    <li key={`${point.username}-${point.postDate}`} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="tabular-nums font-bold">{numberFormat.format(dayViews(point))}</span>
                      {point.actualViews === null && <span className="text-[10px] text-[color:var(--color-text-secondary)]">推定</span>}
                      <span>@{point.username}</span>
                      <span className="text-xs text-[color:var(--color-text-secondary)]">{shortDate(point.postDate)}の投稿</span>
                      <button
                        type="button"
                        className="text-xs text-[color:var(--color-accent)] underline-offset-2 hover:underline"
                        onClick={() => {
                          setHistoryUsername(point.username);
                          setFocusDate(point.postDate);
                          void selectSavedAccount(point.username);
                        }}
                      >
                        投稿を見る
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selectedDaily.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-bold text-[color:var(--color-text-primary)]">@{historyUsername} の日別一覧</h4>
                {selectedSavedUsername !== historyUsername && !loadingCollected && (
                  <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">投稿本文を並べるには、表のアカウント名を押してください。</p>
                )}
                {loadingCollected && selectedSavedUsername === historyUsername && (
                  <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">投稿を読み込んでいます…</p>
                )}
                <ul className="mt-2 divide-y divide-[color:var(--color-border)]">
                  {[...selectedDaily].reverse().map((entry) => {
                    const posts = selectedDailyPosts.get(entry.postDate) ?? [];
                    const focused = focusDate === entry.postDate;
                    return (
                      <li
                        key={entry.postDate}
                        ref={(el) => {
                          dailyRowRefs.current[entry.postDate] = el;
                        }}
                        className={`py-2 text-sm ${focused ? 'rounded-[var(--radius-sm)] bg-amber-50 px-2 ring-1 ring-amber-300' : ''}`}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <span className="w-12 font-medium text-[color:var(--color-text-primary)]">{shortDate(entry.postDate)}</span>
                          <span className={`tabular-nums ${dayViews(entry) >= DAILY_SPIKE_THRESHOLD ? 'font-bold text-amber-900' : ''}`}>
                            閲覧 {entry.actualViews !== null ? numberFormat.format(entry.actualViews) : entry.estimatedViews === null ? (entry.deltaFromPrevious === null ? '–' : `不明（前日差 ${numberFormat.format(entry.deltaFromPrevious)}）`) : `${numberFormat.format(entry.estimatedViews)}（推定）`}
                          </span>
                          <span className="tabular-nums">投稿 {entry.postCount}本</span>
                        </div>
                        {posts.length > 0 && (
                          <ul className="mt-1 space-y-0.5 pl-12 text-xs text-[color:var(--color-text-secondary)]">
                            {[...posts]
                              .sort((left, right) => (latestPostViews.get(right.postId)?.viewsCount ?? -1) - (latestPostViews.get(left.postId)?.viewsCount ?? -1))
                              .slice(0, 8)
                              .map((post) => (
                              <li key={post.postId} className="flex gap-2">
                                <span className="w-16 shrink-0 text-right tabular-nums text-[color:var(--color-text-primary)]">
                                  {latestPostViews.get(post.postId)?.viewsCount === null || latestPostViews.get(post.postId)?.viewsCount === undefined
                                    ? '–'
                                    : numberFormat.format(latestPostViews.get(post.postId)?.viewsCount ?? 0)}
                                </span>
                                <span className="shrink-0 tabular-nums">リプ{post.otherReplyCount}</span>
                                <a href={post.permalink} target="_blank" rel="noreferrer" className="truncate hover:underline">
                                  {post.text.replace(/\s+/g, ' ').slice(0, 60) || '（本文なし）'}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {selectedSavedUsername && profileError && !loadingProfile && (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h3 className="font-bold text-[color:var(--color-text-primary)]">@{selectedSavedUsername} の投稿構成</h3>
              <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">過去{periodDays}日・保存済みデータ</p>
            </div>
            <button type="button" onClick={() => void runAnalysis()} disabled={analyzing || visibleCollectedPosts.length === 0} className={primaryButton}>
              {analyzing ? 'AI分析中…' : 'AIで構成を分析'}
            </button>
          </div>

          {loadingCollected && <p className="mt-6 text-sm text-[color:var(--color-text-secondary)]">保存済み投稿を読み込んでいます…</p>}
          {collectedError && <div className="mt-5"><InlineError>{collectedError}</InlineError></div>}
          {!loadingCollected && !collectedError && visibleCollectedPosts.length === 0 && (
            <p className="mt-5 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-4 py-6 text-sm text-[color:var(--color-text-secondary)]">
              この期間の保存済み投稿がありません。プロフィール欄から最新データを収集してください。
            </p>
          )}
          {structureSummary && (
            <div className="mt-5 grid grid-cols-2 gap-y-4 border-y border-[color:var(--color-border)] py-4 sm:grid-cols-5">
              <Metric label="分析対象" value={`${structureSummary.postCount}件`} accent />
              <Metric label="ツリー投稿率" value={`${structureSummary.treeRate}%`} />
              <Metric label="平均ツリー返信" value={`${structureSummary.avgReplies}件`} />
              <Metric label="平均本文文字数" value={`${structureSummary.avgLength}字`} />
              <Metric label="最多投稿時間" value={structureSummary.topHour === undefined ? '—' : `${structureSummary.topHour}時台`} />
            </div>
          )}

          {analysisError && <div className="mt-5"><InlineError>{analysisError}</InlineError></div>}
          {analysis && (
            <div className="mt-6 border-l-4 border-[color:var(--color-accent)] pl-4 sm:pl-5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-[color:var(--color-text-primary)]">AI構成分析</h4>
                <span className="text-xs text-[color:var(--color-text-secondary)]">{analysis.postCount}件を分析</span>
              </div>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-[color:var(--color-text-primary)]">{analysis.summary}</p>

              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div>
                  <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">よく扱うテーマ</h5>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {analysis.themes.map((theme) => <span key={theme} className="rounded-full bg-[color:var(--color-surface-muted)] px-3 py-1 text-xs text-[color:var(--color-text-primary)]">{theme}</span>)}
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">繰り返している型</h5>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[color:var(--color-text-primary)]">
                    {analysis.recurringPatterns.map((pattern) => <li key={pattern} className="flex gap-2"><span aria-hidden="true" className="text-[color:var(--color-accent)]">—</span><span>{pattern}</span></li>)}
                  </ul>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">冒頭のパターン</h5>
                  <div className="mt-2 space-y-3">
                    {analysis.hookPatterns.map((item) => (
                      <div key={`${item.pattern}-${item.evidence}`}>
                        <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{item.pattern}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-text-secondary)]">{item.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">CTAの置き方</h5>
                  <div className="mt-2 space-y-3">
                    {analysis.ctaPatterns.map((item) => (
                      <div key={`${item.pattern}-${item.position}`}>
                        <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{item.pattern}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-text-secondary)]">{item.position}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">自分の投稿に使える企画</h5>
                <div className="mt-2 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
                  {analysis.contentIdeas.map((idea) => (
                    <div key={idea.title} className="py-3 sm:grid sm:grid-cols-[220px_1fr] sm:gap-4">
                      <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{idea.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[color:var(--color-text-secondary)] sm:mt-0">{idea.angle}</p>
                    </div>
                  ))}
                </div>
              </div>

              {analysis.referencePosts.length > 0 && (
                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-[color:var(--color-text-primary)]">参考にする投稿</h5>
                  <div className="mt-2 space-y-2">
                    {analysis.referencePosts.map((item) => {
                      const post = referencePostMap.get(item.postId);
                      return (
                        <div key={item.postId} className="rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-3 py-3">
                          <p className="line-clamp-2 text-sm text-[color:var(--color-text-primary)]">{post?.text || item.postId}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                            <span>{item.reason}</span>
                            {post?.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-accent)] hover:underline">Threadsで開く</a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {analysis.limitations.length > 0 && (
                <p className="mt-5 text-xs leading-5 text-[color:var(--color-text-secondary)]">分析上の注意：{analysis.limitations.join(' / ')}</p>
              )}
            </div>
          )}

          {visibleCollectedPosts.length > 0 && (
            <div className="mt-7">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)]">保存済み投稿</h4>
                <span className="text-xs text-[color:var(--color-text-secondary)]">{visibleCollectedPosts.length}件</span>
              </div>
              <div className="max-h-[720px] divide-y divide-[color:var(--color-border)] overflow-y-auto border-y border-[color:var(--color-border)]">
                {visibleCollectedPosts.map((post) => (
                  <article key={post.postId} className="py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">
                      <span>{formatDateTime(post.postedAt)}</span>
                      <span>{[...post.text].length}字</span>
                      {post.selfReplyCount > 0 && <span className="font-medium text-[color:var(--color-accent)]">ツリー返信 {post.selfReplyCount}件・最大{post.maxDepth}段</span>}
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-accent)] hover:underline">Threadsで開く</a>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">{post.text || '（本文なし）'}</p>
                    {post.selfReplyCount > 0 && (
                      <button type="button" onClick={() => void toggleSavedReplies(post)} className="mt-2 text-xs font-medium text-[color:var(--color-accent)] hover:underline">
                        {openSavedPostId === post.postId ? 'ツリーを閉じる' : '保存したツリーを読む'}
                      </button>
                    )}
                    {openSavedPostId === post.postId && (
                      <div className="mt-3 space-y-3 border-l-2 border-[color:var(--color-border)] pl-4">
                        {loadingSavedPostId === post.postId && <p className="text-xs text-[color:var(--color-text-secondary)]">読み込み中…</p>}
                        {loadingSavedPostId !== post.postId && !savedNodes[post.postId]?.length && <p className="text-xs text-[color:var(--color-text-secondary)]">保存済みのツリー返信はありません。</p>}
                        {savedNodes[post.postId]?.map((node) => (
                          <div key={node.nodeId}>
                            <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{node.depth}段目・{formatGap(node.secondsAfterRoot)}</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">{node.text || '（本文なし）'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
