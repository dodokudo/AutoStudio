export interface ThreadsDailyMetric {
  date: string; // yyyy-MM-dd (JST)
  followersSnapshot: number;
  profileViews: number;
}

export interface ThreadsPost {
  postId: string;
  postedAt: string; // ISO string
  permalink: string;
  content: string;
  impressions: number;
  likes: number;
  templateId?: string;
  updatedAt?: string;
}

export interface ThreadsPostDelta {
  postId: string;
  date: string;
  impressionsDelta: number;
  likesDelta: number;
}

export interface TemplateMeta {
  templateId: string;
  version: number;
  themeTag: string;
  structureNotes: string;
  status: 'active' | 'candidate' | 'needs_review' | 'archived';
  impressionAvg72h?: number;
  likeAvg72h?: number;
  followerDelta?: number;
}

export interface PlannedPostComment {
  order: number;
  text: string;
  purpose: 'insight' | 'cta' | 'cross_link' | 'other';
}

export interface PlannedPost {
  id: string;
  templateId: string;
  themeTag: string;
  mainPost: {
    text: string;
    hookType: string;
    targetPain: string;
  };
  comments: PlannedPostComment[];
  relatedPosts: string[];
  suggestedSchedule: string; // HH:mm
  reasoning: string;
  status: 'draft' | 'approved' | 'rejected';
}

export interface PublishingJob {
  jobId: string;
  planId: string;
  scheduledAt: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  retryCount: number;
  errorMessage?: string;
  publishedThreadId?: string;
  publishedCommentIds?: string[];
}
