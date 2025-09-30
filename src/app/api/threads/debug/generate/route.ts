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
      CLAUDE_API_KEY: !!process.env.CLAUDE_API_KEY,
      BQ_PROJECT_ID: !!process.env.BQ_PROJECT_ID,
      THREADS_TOKEN: !!process.env.THREADS_TOKEN,
      THREADS_BUSINESS_ID: !!process.env.THREADS_BUSINESS_ID,
      THREADS_POSTING_ENABLED: process.env.THREADS_POSTING_ENABLED,
    };

    return NextResponse.json({
      status: 'success',
      payload: {
        meta: payload.meta,
        writingChecklist: payload.writingChecklist,
        templateCount: payload.templateSummaries?.length || 0,
        competitorHighlightsCount: payload.competitorHighlights?.length || 0,
        trendingTopicsCount: payload.trendingTopics?.length || 0,
        competitorSelectedCount: payload.competitorSelected?.length || 0,
        ownWinningPostsCount: payload.ownWinningPosts?.length || 0,
        competitorSelectedTiers: payload.competitorSelected ? {
          tier_S: payload.competitorSelected.filter(p => p.tier === 'tier_S').length,
          tier_A: payload.competitorSelected.filter(p => p.tier === 'tier_A').length,
          tier_B: payload.competitorSelected.filter(p => p.tier === 'tier_B').length,
          tier_C: payload.competitorSelected.filter(p => p.tier === 'tier_C').length,
        } : {},
        ownWinningPostsPatterns: payload.ownWinningPosts ? {
          pattern_win: payload.ownWinningPosts.filter(p => p.evaluation === 'pattern_win').length,
          pattern_niche_hit: payload.ownWinningPosts.filter(p => p.evaluation === 'pattern_niche_hit').length,
          pattern_hidden_gem: payload.ownWinningPosts.filter(p => p.evaluation === 'pattern_hidden_gem').length,
        } : {},
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