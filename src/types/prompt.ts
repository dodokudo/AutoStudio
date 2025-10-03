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
  totalProfileViews: number;
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

export interface PromptSelfPostBreakdown {
  postId: string;
  impressions: number;
  likes: number;
  mainPost: string;
  comments: string[];
  permalink: string;
}

export interface PromptCompetitorStructure {
  accountName: string;
  username: string | null;
  structureSummary: string;
  example: string;
}

export interface PromptWritingChecklist {
  enforcedTheme: string;
  aiKeywords: string[];
  reminders: string[];
}

export interface CompetitorPost {
  account_name: string;
  username: string;
  post_date: string;
  content: string;
  impressions: number;
  likes: number;
  genre: string;
  followers: number;
  followers_delta: number;
  evaluation: 'pattern_win' | 'pattern_niche_hit' | 'pattern_hidden_gem';
  tier: 'tier_S' | 'tier_A' | 'tier_B' | 'tier_C';
  score: number;
}

export interface OwnPost {
  post_id: string;
  post_date: string;
  content: string;
  impressions_total: number;
  likes_total: number;
  followers_delta_2d: number;
  evaluation: 'pattern_win' | 'pattern_niche_hit' | 'pattern_hidden_gem';
  score: number;
}

export interface ThreadsPromptPayload {
  meta: PromptMeta;
  accountSummary: PromptAccountSummary;
  topSelfPosts: PromptSelfPost[];
  competitorHighlights: PromptCompetitorHighlight[];
  trendingTopics: PromptTrendingTopic[];
  templateSummaries: PromptTemplateSummary[];
  postCount: number;
  curatedSelfPosts: PromptSelfPostBreakdown[];
  competitorStructures: PromptCompetitorStructure[];
  writingChecklist: PromptWritingChecklist;
  competitorSelected: CompetitorPost[];
  ownWinningPosts: OwnPost[];
}
