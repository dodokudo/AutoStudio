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

export async function getThreadsInsights(
  projectId: string,
  options: ThreadsInsightsOptions = {},
): Promise<ThreadsInsightsData> {
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
}
