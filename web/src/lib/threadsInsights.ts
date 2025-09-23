import { buildThreadsPromptPayload } from './promptBuilder';
import type {
  PromptCompetitorHighlight,
  PromptSelfPost,
  ThreadsPromptPayload,
} from '../types/prompt';

export interface ThreadsInsightsData {
  meta: ThreadsPromptPayload['meta'];
  accountSummary: ThreadsPromptPayload['accountSummary'];
  topSelfPosts: PromptSelfPost[];
  competitorHighlights: PromptCompetitorHighlight[];
  trendingTopics: ThreadsPromptPayload['trendingTopics'];
}

export async function getThreadsInsights(projectId: string): Promise<ThreadsInsightsData> {
  const payload = await buildThreadsPromptPayload({ projectId });

  return {
    meta: payload.meta,
    accountSummary: payload.accountSummary,
    topSelfPosts: payload.topSelfPosts,
    competitorHighlights: payload.competitorHighlights,
    trendingTopics: payload.trendingTopics,
  };
}
