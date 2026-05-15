import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { getStoryMetricsDashboardData } from '@/lib/instagram/storyMetricsDashboard';

export const revalidate = 1800;

const getCachedStoryMetricsDashboardData = unstable_cache(
  async () => getStoryMetricsDashboardData(),
  ['instagram-story-metrics-dashboard'],
  { revalidate: 1800 },
);

export async function GET() {
  try {
    const data = await getCachedStoryMetricsDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/instagram/story-metrics]', err);
    return NextResponse.json({ rows: [], lastUpdatedAt: null }, { status: 500 });
  }
}
