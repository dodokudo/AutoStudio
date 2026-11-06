import { NextResponse } from 'next/server';
import { getSalesAttributions, saveSalesAttribution } from '@/lib/sales/attributions';
import { validateAttribution } from '@/lib/sales/commissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ attributions: await getSalesAttributions() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: '販売経由を取得できませんでした' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!validateAttribution(body)) return NextResponse.json({ error: '報酬ありの場合は支払先の名前を入力してください' }, { status: 400 });
    await saveSalesAttribution(body);
    const saved = (await getSalesAttributions()).find((row) => row.revenueKey === body.revenueKey);
    if (!saved) throw new Error('Readback failed');
    return NextResponse.json({ attribution: saved });
  } catch {
    return NextResponse.json({ error: '販売経由を保存できませんでした' }, { status: 500 });
  }
}
