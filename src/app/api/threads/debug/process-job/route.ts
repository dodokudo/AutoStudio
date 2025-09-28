import { NextResponse } from 'next/server';
import { processNextJob } from '@/lib/threadsWorker';

export async function POST() {
  try {
    console.log('[debug/process-job] Starting manual job processing...');

    const result = await processNextJob();

    console.log('[debug/process-job] Job processing result:', result);

    return NextResponse.json({
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[debug/process-job] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}