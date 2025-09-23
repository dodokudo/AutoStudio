import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import {
  fetchNextPendingJob,
  markJobProcessing,
  markJobResult,
} from '@/lib/bigqueryJobs';
import { listPlans, updatePlanStatus } from '@/lib/bigqueryPlans';
import { postThread } from '@/lib/threadsApi';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function processJob() {
  const job = await fetchNextPendingJob();
  if (!job) {
    console.log('No pending jobs.');
    return;
  }

  console.log(`Processing job ${job.job_id} (plan ${job.plan_id})`);
  await markJobProcessing(job.job_id);

  try {
    const plans = await listPlans();
    const plan = plans.find((item) => item.plan_id === job.plan_id);
    if (!plan) {
      throw new Error('Plan not found for job');
    }

    const mainThreadId = await postThread(plan.main_text);
    const comments = (() => {
      try {
        const parsed = JSON.parse(plan.comments ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    let replyToId = mainThreadId;
    for (const comment of comments) {
      const commentThreadId = await postThread(comment.text, replyToId);
      replyToId = commentThreadId;
    }

    await markJobResult(job.job_id, 'succeeded', {
      postedThreadId: mainThreadId,
    });

    await updatePlanStatus(plan.plan_id, 'scheduled');

    console.log(`Job ${job.job_id} succeeded with thread ${mainThreadId}`);
  } catch (error) {
    console.error(`Job ${job.job_id} failed`, error);
    await markJobResult(job.job_id, 'failed', {
      errorMessage: (error as Error).message,
    });
  }
}

async function main() {
  await processJob();
}

main().catch((error) => {
  console.error('Worker crashed', error);
  process.exitCode = 1;
});
