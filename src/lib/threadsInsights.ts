import { buildThreadsPromptPayload } from './promptBuilder';
import type {
  PromptCompetitorHighlight,
  PromptSelfPost,
  PromptSelfPostBreakdown,
  PromptCompetitorStructure,
  ThreadsPromptPayload,
} from '../types/prompt';

export interface ThreadsInsightsData {
  meta: ThreadsPromptPayload['meta'];
  accountSummary: ThreadsPromptPayload['accountSummary'];
  topSelfPosts: PromptSelfPost[];
  competitorHighlights: PromptCompetitorHighlight[];
  trendingTopics: ThreadsPromptPayload['trendingTopics'];
  templateSummaries: ThreadsPromptPayload['templateSummaries'];
  postCount: number;
  curatedSelfPosts: PromptSelfPostBreakdown[];
  competitorStructures: PromptCompetitorStructure[];
  writingChecklist: ThreadsPromptPayload['writingChecklist'];
}

export interface ThreadsInsightsOptions {
  rangeDays?: number;
  referenceDate?: string;
  startDate?: string;
  endDate?: string;
}

const CACHE_TTL_MS = 1000 * 60 * 5;
const cacheStore = new Map<string, { data: ThreadsInsightsData; fetchedAt: number }>();

export async function getThreadsInsights(
  projectId: string,
  options: ThreadsInsightsOptions = {},
): Promise<ThreadsInsightsData> {
  const cacheKey = JSON.stringify({
    projectId,
    rangeDays: options.rangeDays ?? null,
    referenceDate: options.referenceDate ?? null,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
  });
  const now = Date.now();
  const cached = cacheStore.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const payload = await buildThreadsPromptPayload({
    projectId,
    rangeDays: options.rangeDays,
    referenceDate: options.referenceDate,
    startDate: options.startDate,
    endDate: options.endDate,
  });

  return {
    meta: payload.meta,
    accountSummary: payload.accountSummary,
    topSelfPosts: payload.topSelfPosts,
    competitorHighlights: payload.competitorHighlights,
    trendingTopics: payload.trendingTopics,
    templateSummaries: payload.templateSummaries,
    postCount: payload.postCount,
    curatedSelfPosts: payload.curatedSelfPosts,
    competitorStructures: payload.competitorStructures,
    writingChecklist: payload.writingChecklist,
  };

  cacheStore.set(cacheKey, { data: result, fetchedAt: now });
  return result;
}
