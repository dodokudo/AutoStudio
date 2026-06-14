export type ScheduledPostMediaItem = {
  url: string;
  type: 'IMAGE' | 'VIDEO';
  name?: string;
  altText?: string;
};

export type ScheduledPost = {
  scheduleId: string;
  planId?: string | null;
  scheduledAt: string;
  scheduledAtJst: string;
  scheduledDate: string;
  status: string;
  sourceAccountKey?: string | null;
  targetAccountKey?: string | null;
  mainText: string;
  mediaItems: ScheduledPostMediaItem[];
  comment1: string;
  comment1MediaItems: ScheduledPostMediaItem[];
  comment2: string;
  comment2MediaItems: ScheduledPostMediaItem[];
  comment3: string;
  comment4: string;
  comment5: string;
  comment6: string;
  comment7: string;
  comment8: string;
  createdAt: string;
  updatedAt: string;
  templateId?: string | null;
  theme?: string | null;
  planStatus?: string | null;
};
