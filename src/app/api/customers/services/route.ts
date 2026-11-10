import { NextResponse } from 'next/server';
import { readServices, saveServices } from '@/lib/customers/services';
export async function GET() {
  return NextResponse.json({
    services: await readServices(),
    editable: true,
  });
}
export async function POST(request: Request) {
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
