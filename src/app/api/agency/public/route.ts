import { NextRequest, NextResponse } from 'next/server';
import { getAgencyStats } from '@/lib/agency';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * GET /api/agency/public?token=XXX
 *
 * 代理店向けの集計済み数値のみを返す公開API（LaunchKitのダッシュボードから参照）。
 * 個人情報は一切含まない。AGENCY_PUBLIC_TOKEN が一致しない場合は401。
 */
export async function GET(request: NextRequest) {
  const expectedToken = process.env.AGENCY_PUBLIC_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503, headers: CORS_HEADERS });
  }

  const token = request.nextUrl.searchParams.get('token');
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  try {
    const stats = await getAgencyStats();
    return NextResponse.json(stats, {
      headers: {
        ...CORS_HEADERS,
        // データ更新は1日1回（Lstep取り込み）なので10分キャッシュで十分
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('[api/agency/public] Error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
