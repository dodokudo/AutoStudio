import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { ThreadsDiscoveryAPI } from '@/lib/threadsDiscovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_EVALUATED_CANDIDATES = 20;
const PROFILE_LOOKUP_CONCURRENCY = 4;
const MIN_VIEWS_FOR_REACTION_RATE = 100;

type CandidateStatus = 'strong' | 'watch' | 'review' | 'unavailable';

interface CandidateProfile {
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

interface CandidateEvaluation {
  username: string;
  postCount: number;
  relevantPostCount: number;
  relevanceScore: number;
  latestPostAt: string | null;
  profile: CandidateProfile | null;
  viewEfficiency: number | null;
  reactionRate: number | null;
  reactionCount: number | null;
  strengthScore: number | null;
  status: CandidateStatus;
  error: string | null;
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s　]+/g, '');
}

function keywordVariants(keyword: string): string[] {
  const normalized = normalizeForMatch(keyword);
  return [
    normalized,
    normalized.replaceAll('threads', 'スレッズ'),
    normalized.replaceAll('スレッズ', 'threads'),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function keywordTokens(keyword: string): string[] {
  const tokens = keyword
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .split(/[\s　,、/|]+/)
    .map((token) => token.trim())
    .filter((token) => [...token].length >= 2);
  return [...new Set(tokens)];
}

function postRelevance(keyword: string, text = '', topicTag = ''): number {
  const compactText = normalizeForMatch(text);
  const compactTag = normalizeForMatch(topicTag);
  const variants = keywordVariants(keyword);
  if (variants.some((variant) => compactText.includes(variant) || compactTag.includes(variant))) {
    return 100;
  }

  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return 20;
  const matched = tokens.filter((token) => compactText.includes(token) || compactTag.includes(token));
  if (matched.length === tokens.length) return 70;
  if (matched.length > 0) return 45;
  return 20;
}

function percentile(value: number | null, values: number[]): number {
  if (value === null || values.length === 0) return 0;
  if (values.length === 1) return 50;
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return ((below + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
}

async function evaluateProfiles(
  api: ThreadsDiscoveryAPI,
  evaluations: CandidateEvaluation[]
): Promise<void> {
  for (let index = 0; index < evaluations.length; index += PROFILE_LOOKUP_CONCURRENCY) {
    const batch = evaluations.slice(index, index + PROFILE_LOOKUP_CONCURRENCY);
    await Promise.all(
      batch.map(async (candidate) => {
        try {
          candidate.profile = await api.profileLookup(candidate.username);
        } catch {
          candidate.error = 'プロフィールを取得できませんでした';
          candidate.status = 'unavailable';
        }
      })
    );
  }
}

function scoreCandidates(candidates: CandidateEvaluation[]): void {
  const available = candidates.filter((candidate) => candidate.profile);
  for (const candidate of available) {
    const profile = candidate.profile;
    if (!profile) continue;
    const followers = profile.follower_count ?? 0;
    const views = profile.views_count ?? 0;
    const reactions =
      (profile.likes_count ?? 0) +
      (profile.replies_count ?? 0) +
      (profile.reposts_count ?? 0) +
      (profile.quotes_count ?? 0);
    candidate.reactionCount = reactions;
    candidate.viewEfficiency = followers > 0 ? views / followers : null;
    candidate.reactionRate = views >= MIN_VIEWS_FOR_REACTION_RATE ? reactions / views : null;
  }

  const views = available.map((candidate) => candidate.profile?.views_count ?? 0);
  const efficiencies = available
    .map((candidate) => candidate.viewEfficiency)
    .filter((value): value is number => value !== null);
  const reactionRates = available
    .map((candidate) => candidate.reactionRate)
    .filter((value): value is number => value !== null);

  for (const candidate of available) {
    const score =
      percentile(candidate.profile?.views_count ?? null, views) * 0.35 +
      percentile(candidate.viewEfficiency, efficiencies) * 0.3 +
      percentile(candidate.reactionRate, reactionRates) * 0.2 +
      candidate.relevanceScore * 0.15;
    candidate.strengthScore = Math.round(score);
    candidate.status =
      score >= 70 && candidate.relevanceScore >= 45
        ? 'strong'
        : score >= 45 && candidate.relevanceScore >= 25
          ? 'watch'
          : 'review';
  }
}

export async function GET(request: NextRequest) {
  const keyword = (request.nextUrl.searchParams.get('q') || '').trim();
  if (!keyword) {
    return NextResponse.json({ error: 'キーワードを入力してください' }, { status: 400 });
  }

  try {
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json({ error: 'Threadsのアクセストークンが見つかりません' }, { status: 503 });
    }

    const searchMode = request.nextUrl.searchParams.get('mode') === 'TAG' ? 'TAG' : 'KEYWORD';
    const searchType = request.nextUrl.searchParams.get('sort') === 'RECENT' ? 'RECENT' : 'TOP';
    const requestedDays = Number(request.nextUrl.searchParams.get('days') || 30);
    const periodDays = [7, 30, 90, 180].includes(requestedDays) ? requestedDays : 30;
    const until = Math.floor(Date.now() / 1000);
    const since = until - periodDays * 24 * 60 * 60;
    const discovery = new ThreadsDiscoveryAPI(accessToken);
    const posts = await discovery.keywordSearch(keyword, {
      searchMode,
      searchType,
      since,
      until,
      limit: 50,
    });
    const grouped = new Map<
      string,
      { postCount: number; relevantPostCount: number; relevanceScore: number; latestPostAt: string | null; firstIndex: number }
    >();
    posts.forEach((post, index) => {
      if (!post.username) return;
      const relevance = postRelevance(keyword, post.text, post.topic_tag);
      const current = grouped.get(post.username) ?? {
        postCount: 0,
        relevantPostCount: 0,
        relevanceScore: 20,
        latestPostAt: null,
        firstIndex: index,
      };
      current.postCount += 1;
      if (relevance >= 45) current.relevantPostCount += 1;
      current.relevanceScore = Math.max(current.relevanceScore, relevance);
      if (!current.latestPostAt || post.timestamp > current.latestPostAt) {
        current.latestPostAt = post.timestamp;
      }
      grouped.set(post.username, current);
    });

    const rankedCandidates = Array.from(grouped, ([username, value]) => ({
      username,
      postCount: value.postCount,
      relevantPostCount: value.relevantPostCount,
      relevanceScore: value.relevanceScore,
      latestPostAt: value.latestPostAt,
      firstIndex: value.firstIndex,
    }))
      .sort(
        (left, right) =>
          right.relevantPostCount - left.relevantPostCount ||
          right.relevanceScore - left.relevanceScore ||
          right.postCount - left.postCount ||
          left.firstIndex - right.firstIndex
      )
      .slice(0, MAX_EVALUATED_CANDIDATES);
    const candidates: CandidateEvaluation[] = rankedCandidates.map((candidate) => ({
      username: candidate.username,
      postCount: candidate.postCount,
      relevantPostCount: candidate.relevantPostCount,
      relevanceScore: candidate.relevanceScore,
      latestPostAt: candidate.latestPostAt,
      profile: null,
      viewEfficiency: null,
      reactionRate: null,
      reactionCount: null,
      strengthScore: null,
      status: 'review' as CandidateStatus,
      error: null,
    }));

    await evaluateProfiles(discovery, candidates);
    scoreCandidates(candidates);
    const statusOrder: Record<CandidateStatus, number> = {
      strong: 0,
      watch: 1,
      review: 2,
      unavailable: 3,
    };
    candidates.sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        (right.strengthScore ?? -1) - (left.strengthScore ?? -1) ||
        right.relevanceScore - left.relevanceScore ||
        right.postCount - left.postCount
    );
    const authors = candidates.map(({ username, postCount }) => ({ username, postCount }));

    return NextResponse.json({
      keyword,
      searchMode,
      searchType,
      periodDays,
      evaluatedAt: new Date().toISOString(),
      maxEvaluatedCandidates: MAX_EVALUATED_CANDIDATES,
      posts,
      authors,
      candidates,
    });
  } catch (error) {
    console.error('[threads/research/search] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '検索に失敗しました' },
      { status: 500 },
    );
  }
}
