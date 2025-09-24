import { NextRequest, NextResponse } from 'next/server';
import { getLatestPrompt, listPromptVersions, savePrompt, restorePrompt } from '@/lib/promptSettings';

export async function GET() {
  try {
    const latest = await getLatestPrompt();
    const versions = await listPromptVersions(10);
    return NextResponse.json({ latest, versions });
  } catch (error) {
    console.error('[threads/prompt] GET failed', error);
    return NextResponse.json({ error: 'Failed to load prompt' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { promptText, restoreVersion } = await request.json();
    if (restoreVersion !== undefined) {
      const restored = await restorePrompt(Number(restoreVersion));
      return NextResponse.json({ restored });
    }
    if (typeof promptText !== 'string' || !promptText.trim()) {
      return NextResponse.json({ error: 'promptText is required' }, { status: 400 });
    }
    const saved = await savePrompt(promptText);
    return NextResponse.json({ saved });
  } catch (error) {
    console.error('[threads/prompt] POST failed', error);
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 });
  }
}
