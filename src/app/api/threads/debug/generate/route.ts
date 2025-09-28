import { NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();

export async function GET() {
  try {
    console.log('[debug/generate] Starting test...');

    // Test buildThreadsPromptPayload
    let payload;
    try {
      payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
      console.log('[debug/generate] buildThreadsPromptPayload success, payload keys:', Object.keys(payload));
    } catch (error) {
      console.error('[debug/generate] buildThreadsPromptPayload failed:', error);
      return NextResponse.json({
        step: 'buildThreadsPromptPayload',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, { status: 500 });
    }

    // Test environment variables
    const envCheck = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      BQ_PROJECT_ID: !!process.env.BQ_PROJECT_ID,
      THREADS_ACCESS_TOKEN: !!process.env.THREADS_ACCESS_TOKEN,
      THREADS_USER_ID: !!process.env.THREADS_USER_ID,
    };

    return NextResponse.json({
      status: 'success',
      payload: {
        meta: payload.meta,
        writingChecklist: payload.writingChecklist,
        templateCount: payload.templateSummaries?.length || 0,
        competitorHighlightsCount: payload.competitorHighlights?.length || 0,
        trendingTopicsCount: payload.trendingTopics?.length || 0,
      },
      environment: envCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[debug/generate] Unexpected error:', error);
    return NextResponse.json({
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}