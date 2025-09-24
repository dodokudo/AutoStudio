import {
  fetchNextPendingJob,
  markJobProcessing,
  markJobResult,
} from '@/lib/bigqueryJobs';
import { listPlans, updatePlanStatus } from '@/lib/bigqueryPlans';
import { postThread } from '@/lib/threadsApi';
import { notifyJobFailure } from '@/lib/notifications';

function parseComments(comments: string) {
  try {
    const parsed = JSON.parse(comments ?? '[]');
    return Array.isArray(parsed) ? (parsed as { order: number; text: string }[]) : [];
  } catch {
    return [];
  }
}

export async function processNextJob() {
  const job = await fetchNextPendingJob();
  if (!job) {
    return { status: 'idle' as const };
  }

  await markJobProcessing(job.job_id);

  try {
    const plans = await listPlans();
    const plan = plans.find((item) => item.plan_id === job.plan_id);
    if (!plan) {
      throw new Error('Plan not found for job');
    }

    const mainThreadId = await postThread(plan.main_text);
    let replyToId = mainThreadId;
    for (const comment of parseComments(plan.comments ?? '[]')) {
      const commentThreadId = await postThread(comment.text, replyToId);
      replyToId = commentThreadId;
    }

    await markJobResult(job.job_id, 'succeeded', { postedThreadId: mainThreadId });
    await updatePlanStatus(plan.plan_id, 'scheduled');

    return { status: 'succeeded' as const, jobId: job.job_id, postedThreadId: mainThreadId };
  } catch (error) {
    const message = (error as Error).message ?? 'unknown error';
    await markJobResult(job.job_id, 'failed', { errorMessage: message });
    await notifyJobFailure(job.plan_id, message);
    return { status: 'failed' as const, jobId: job.job_id, error: message };
  }
}
