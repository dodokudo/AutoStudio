import { buildScheduleSlots } from './promptBuilder';
import { getThreadsInsights } from './threadsInsights';
import { resolveProjectId } from './bigquery';

const PROJECT_ID = resolveProjectId();

export type PlanStatus = 'draft' | 'approved' | 'scheduled' | 'rejected';

export interface ThreadPlan {
  id: string;
  scheduledTime: string;
  templateId: string;
  theme: string;
  status: PlanStatus;
  mainText: string;
  comments: { order: number; text: string }[];
}

let cachedPlans: ThreadPlan[] | null = null;

export async function getThreadPlans(): Promise<ThreadPlan[]> {
  if (cachedPlans) {
    return cachedPlans;
  }

  const insights = await getThreadsInsights(PROJECT_ID);
  const schedule = buildScheduleSlots(insights.meta.targetPostCount);

  cachedPlans = insights.topSelfPosts.slice(0, 5).map((post, index) => ({
    id: post.postId ?? `plan-${index + 1}`,
    scheduledTime: schedule[index] ?? '07:00',
    templateId: 'auto-generated',
    theme: insights.trendingTopics[index]?.themeTag ?? '未分類',
    status: (index === 0 ? 'draft' : index === 1 ? 'approved' : 'scheduled') as PlanStatus,
    mainText: post.content?.slice(0, 280) ?? '',
    comments: [],
  }));

  return cachedPlans;
}

export async function mutatePlanStatus(id: string, status: PlanStatus) {
  const plans = await getThreadPlans();
  cachedPlans = plans.map((plan) => (plan.id === id ? { ...plan, status } : plan));
  return cachedPlans.find((plan) => plan.id === id);
}
