import { NextRequest, NextResponse } from 'next/server';
import { logClick } from '@/lib/links/bigquery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClickPayload {
  shortLinkId?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as ClickPayload;

    if (!payload.shortLinkId) {
      return NextResponse.json({ error: 'shortLinkId is required' }, { status: 400 });
    }

    await logClick(payload.shortLinkId, {
      referrer: payload.referrer,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
      deviceType: payload.deviceType,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[links/click] failed', error);
    return NextResponse.json({ error: 'Failed to log click' }, { status: 500 });
  }
}
