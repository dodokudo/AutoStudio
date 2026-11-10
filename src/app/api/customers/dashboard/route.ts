import { NextResponse } from 'next/server';
import { readServices } from '@/lib/customers/services';
import { loadCustomerDataset } from '@/lib/customers/data';
import { readFollowups } from '@/lib/customers/followup-store';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(
      {
        ...(await loadCustomerDataset(await readServices())),
        followups: await readFollowups(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    console.error(
      '[customers] load failed',
      e instanceof Error ? e.name : 'unknown',
    );
    return NextResponse.json(
      { error: '顧客データを取得できませんでした。再読み込みしてください。' },
      { status: 503 },
    );
  }
}
