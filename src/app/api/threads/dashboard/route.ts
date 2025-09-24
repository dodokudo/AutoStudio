import { NextResponse } from 'next/server';
import { getThreadsDashboard } from '@/lib/threadsDashboard';

export async function GET() {
  try {
    const data = await getThreadsDashboard();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[threads/dashboard] failed', error);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}
