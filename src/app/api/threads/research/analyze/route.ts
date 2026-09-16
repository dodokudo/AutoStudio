import { NextRequest, NextResponse } from 'next/server';

import { THREADS_RESEARCH_OWNER_ID } from '@/lib/threadsResearch';
import { analyzeResearchAccount } from '@/lib/threadsResearchAnalysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.username !== 'string' || !body.username.trim()) {
      return NextResponse.json({ error: 'usernameが必要です' }, { status: 400 });
    }
    const analysis = await analyzeResearchAccount(
      THREADS_RESEARCH_OWNER_ID,
      body.username,
      typeof body.periodDays === 'number' ? body.periodDays : 30,
    );
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('[threads/research/analyze] failed', error);
    const raw = error instanceof Error ? error.message : '分析に失敗しました';
    const missingKey = raw.includes('OPENAI_API_KEY');
    return NextResponse.json(
      { error: missingKey ? 'OpenAI APIキーが未設定です' : raw },
      { status: missingKey ? 503 : 500 },
    );
  }
}
