import { NextResponse } from 'next/server';
import { processNextJob } from '@/lib/threadsWorker';
import { updateTemplateScores } from '@/lib/templateScores';

export async function POST() {
  try {
    const jobResults = [] as Array<{ status: string; jobId?: string; error?: string }>;
    // Process up to 5 jobs per invocation to avoid long-running requests
    for (let i = 0; i < 5; i += 1) {
      const result = await processNextJob();
      if (result.status === 'idle') {
        break;
      }
      jobResults.push(result);
    }

    const scores = await updateTemplateScores();

    return NextResponse.json(
      {
        jobResults,
        templateScoresInserted: scores.inserted,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[threads/cron/run] failed', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}
