import { NextResponse } from 'next/server';
import { processNextJob } from '@/lib/threadsWorker';

export async function POST() {
  try {
    const result = await processNextJob();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[threads/jobs/run] failed', error);
    return NextResponse.json({ error: 'Job processing failed' }, { status: 500 });
  }
}
