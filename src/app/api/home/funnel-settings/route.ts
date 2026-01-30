import { NextRequest, NextResponse } from 'next/server';
import { getHomeFunnelSettings, saveHomeFunnelSettings } from '@/lib/home/funnel-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getHomeFunnelSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('[api/home/funnel-settings] GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const selectedFunnelId = body.selectedFunnelId ? String(body.selectedFunnelId) : null;
    const hiddenStepsByFunnel = typeof body.hiddenStepsByFunnel === 'object' && body.hiddenStepsByFunnel
      ? body.hiddenStepsByFunnel as Record<string, string[]>
      : {};

    const saved = await saveHomeFunnelSettings({
      selectedFunnelId,
      hiddenStepsByFunnel,
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('[api/home/funnel-settings] PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
