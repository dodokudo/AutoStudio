import { NextResponse } from 'next/server';
import { readServices, saveServices } from '@/lib/customers/services';
export async function GET() {
  return NextResponse.json({
    services: await readServices(),
    editable: process.env.NODE_ENV !== 'production',
  });
}
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production')
    return NextResponse.json(
      { error: 'ローカル確認版のみ保存できます' },
      { status: 403 },
    );
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    return NextResponse.json({
      services: await saveServices((await request.json()).services),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '保存できませんでした' },
      { status: 400 },
    );
  }
}
