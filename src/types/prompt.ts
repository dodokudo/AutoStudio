export interface PromptMeta {
  generationId: string;
  targetPostCount: number;
  recommendedSchedule: string[];
  rangeDays: number;
  rangeStart: string;
  rangeEnd: string;
}

export interface PromptAccountSummary {
  averageFollowers: number;
  averageProfileViews: number;
  followersChange: number;
  profileViewsChange: number;
  recentDates: string[];
}

export interface PromptSelfPost {
  postId: string;
  postedAt: string | null;
  impressions: number;
  likes: number;
  content: string;
  permalink: string;
}

export interface PromptCompetitorHighlight {
  accountName: string;
  username: string | null;
  impressions: number | null;
  likes: number | null;
  postDate: string | null;
  contentSnippet: string;
}

export interface PromptTrendingTopic {
  themeTag: string;
  avgFollowersDelta: number;
  avgViews: number;
  sampleAccounts: string[];
}

export interface PromptTemplateSummary {
  templateId: string;
  version: number;
  status: string;
  impressionAvg72h?: number;
  likeAvg72h?: number;
  structureNotes?: string;
}

export interface ThreadsPromptPayload {
  meta: PromptMeta;
  accountSummary: PromptAccountSummary;
  topSelfPosts: PromptSelfPost[];
  competitorHighlights: PromptCompetitorHighlight[];
  trendingTopics: PromptTrendingTopic[];
  templateSummaries: PromptTemplateSummary[];
  postCount: number;
}
