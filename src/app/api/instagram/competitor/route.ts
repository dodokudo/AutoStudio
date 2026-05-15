import { NextResponse } from 'next/server';
import { getCompetitorDashboardData } from '@/lib/instagram/competitorDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getCompetitorDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/instagram/competitor]', err);
    return NextResponse.json({ error: 'Failed to load competitor data' }, { status: 500 });
  }
}
