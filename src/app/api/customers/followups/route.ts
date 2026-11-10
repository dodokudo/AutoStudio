import { NextResponse } from 'next/server';
import { saveFollowup } from '@/lib/customers/followup-store';
import { loadCustomerDataset } from '@/lib/customers/data';
import { readServices } from '@/lib/customers/services';
import { buildCustomerRoster } from '@/lib/customers/model';
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production')
    return NextResponse.json({ error: '保存先が未設定です' }, { status: 403 });
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    const { customerId, followup } = await request.json();
    if (typeof customerId !== 'string' || customerId.length > 300)
      return NextResponse.json(
        { error: '顧客を選択してください' },
        { status: 400 },
      );
    const data = await loadCustomerDataset(await readServices());
    if (!buildCustomerRoster(data.purchases).some((c) => c.id === customerId))
      return NextResponse.json(
        { error: '顧客が見つかりません' },
        { status: 404 },
      );
    return NextResponse.json({
      followup: await saveFollowup(customerId, followup),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '保存できませんでした' },
      { status: 400 },
    );
  }
}
