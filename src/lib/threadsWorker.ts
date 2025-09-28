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

    console.log('[threadsWorker] Posting main thread:', plan.main_text.substring(0, 100) + '...');
    const mainThreadId = await postThread(plan.main_text);
    console.log('[threadsWorker] Main thread posted successfully, ID:', mainThreadId);

    const comments = parseComments(plan.comments ?? '[]');
    console.log('[threadsWorker] Parsed comments:', comments.length, 'comments found');

    let replyToId = mainThreadId;
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      console.log(`[threadsWorker] Posting comment ${i + 1}/${comments.length}:`, comment.text.substring(0, 50) + '...');
      console.log(`[threadsWorker] Replying to thread ID:`, replyToId);

      // Add delay between posts to avoid rate limiting and ensure proper thread ordering
      if (i > 0) {
        console.log(`[threadsWorker] Waiting 3 seconds before posting comment ${i + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const commentThreadId = await postThread(comment.text, replyToId);
      console.log(`[threadsWorker] Comment ${i + 1} posted successfully, ID:`, commentThreadId);

      replyToId = commentThreadId;
    }

    console.log('[threadsWorker] All posts completed successfully');

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
