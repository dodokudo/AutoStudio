import { NextRequest, NextResponse } from 'next/server';
import {
  THREADS_PROMPT_TYPES,
  getLatestPrompt,
  listPromptVersions,
  savePrompt,
  restorePrompt,
  type ThreadsPromptType,
} from '@/lib/promptSettings';

function parsePromptType(value: unknown): ThreadsPromptType | null {
  return typeof value === 'string' && THREADS_PROMPT_TYPES.includes(value as ThreadsPromptType)
    ? value as ThreadsPromptType
    : null;
}

export async function GET() {
  try {
    const [aiTipsLatest, aiTipsVersions, operationLatest, operationVersions] = await Promise.all([
      getLatestPrompt('ai-tips'),
      listPromptVersions('ai-tips', 10),
      getLatestPrompt('threads-operation'),
      listPromptVersions('threads-operation', 10),
    ]);
    return NextResponse.json({
      prompts: {
        'ai-tips': { latest: aiTipsLatest, versions: aiTipsVersions },
        'threads-operation': { latest: operationLatest, versions: operationVersions },
      },
    });
  } catch (error) {
    console.error('[threads/prompt] GET failed', error);
    return NextResponse.json({ error: 'Failed to load prompt' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { promptType: rawPromptType, promptText, restoreVersion } = await request.json();
    const promptType = parsePromptType(rawPromptType);
    if (!promptType) {
      return NextResponse.json({ error: 'promptType is invalid' }, { status: 400 });
    }
    if (restoreVersion !== undefined) {
      const restored = await restorePrompt(promptType, Number(restoreVersion));
      return NextResponse.json({ restored });
    }
    if (typeof promptText !== 'string' || !promptText.trim()) {
      return NextResponse.json({ error: 'promptText is required' }, { status: 400 });
    }
    const saved = await savePrompt(promptType, promptText);
    return NextResponse.json({ saved });
  } catch (error) {
    console.error('[threads/prompt] POST failed', error);
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
  }
}
