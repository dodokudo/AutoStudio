import { NextResponse } from 'next/server';

export const revalidate = 604800;

const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await context.params;
  if (!SHORTCODE_PATTERN.test(shortcode)) {
    return NextResponse.json({ error: 'Invalid Instagram shortcode' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://www.instagram.com/p/${shortcode}/media/?size=m`, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AutoStudio/1.0)',
      },
      next: { revalidate: 604800 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    });
  } catch (error) {
    console.error('[api/instagram/competitor-thumbnail]', error);
    return NextResponse.json({ error: 'Thumbnail fetch failed' }, { status: 502 });
  }
}
