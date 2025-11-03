import { NextRequest, NextResponse } from 'next/server';
import { getLinkFunnelMetrics } from '@/lib/links/bigquery';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end query parameters are required' }, { status: 400 });
    }

    const metrics = await getLinkFunnelMetrics(id, { startDate: start, endDate: end });
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error('[links/funnels/:id/metrics] GET failed', error);
    const message = error instanceof Error ? error.message : 'Failed to load metrics';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
