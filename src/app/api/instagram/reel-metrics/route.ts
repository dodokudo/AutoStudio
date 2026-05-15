import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { getReelMetricsDashboardData } from '@/lib/instagram/reelMetricsDashboard';

export const revalidate = 1800;

const getCachedReelMetricsDashboardData = unstable_cache(
  async () => getReelMetricsDashboardData(),
  ['instagram-reel-metrics-dashboard'],
  { revalidate: 1800 },
);

export async function GET() {
  try {
    const data = await getCachedReelMetricsDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/instagram/reel-metrics]', err);
    return NextResponse.json({ rows: [], benchmarks: {}, lastUpdatedAt: null }, { status: 500 });
  }
}
