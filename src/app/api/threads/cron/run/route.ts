import { NextResponse } from 'next/server';
import { processNextJob } from '@/lib/threadsWorker';
import { updateTemplateScores } from '@/lib/templateScores';

async function handleCronRun() {
  try {
    console.log('[threads/cron/run] Started at', new Date().toISOString());
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

    console.log('[threads/cron/run] Completed:', {
      jobCount: jobResults.length,
      templateScoresInserted: scores.inserted,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      {
        jobResults,
        templateScoresInserted: scores.inserted,
        timestamp: new Date().toISOString()
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[threads/cron/run] failed', error);
    return NextResponse.json({ error: 'Cron run failed' }, { status: 500 });
  }
}

export async function GET() {
  return handleCronRun();
}

export async function POST() {
  return handleCronRun();
}
