import { NextRequest, NextResponse } from 'next/server';
import { getLinkStats } from '@/lib/links/bigquery';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const stats = await getLinkStats(id);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error('[links/stats] failed', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
