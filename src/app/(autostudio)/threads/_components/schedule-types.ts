export type ScheduledPost = {
  scheduleId: string;
  planId?: string | null;
  scheduledAt: string;
  scheduledAtJst: string;
  scheduledDate: string;
  status: string;
  mainText: string;
  comment1: string;
  comment2: string;
  createdAt: string;
  updatedAt: string;
  templateId?: string | null;
  theme?: string | null;
  planStatus?: string | null;
};
