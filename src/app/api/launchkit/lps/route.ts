import { NextRequest, NextResponse } from 'next/server';
import { createLP, listLPs } from '@/lib/launchkit/bigquery';

export async function GET(request: NextRequest) {
  try {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';
    const lps = await listLPs(includeInactive);
    return NextResponse.json({ lps });
  } catch (error) {
    console.error('[launchkit/lps GET]', error);
    return NextResponse.json({ error: 'failed_to_list' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!name || !slug || !url) {
      return NextResponse.json({ error: 'name, slug, url are required' }, { status: 400 });
    }

    const lp = await createLP({
      name,
      slug,
      url,
      genre: body.genre,
      source: body.source,
      lineCtaUrl: body.line_cta_url || body.lineCtaUrl,
    });
    return NextResponse.json({ lp }, { status: 201 });
  } catch (error) {
    console.error('[launchkit/lps POST]', error);
    return NextResponse.json({ error: 'failed_to_create' }, { status: 500 });
  }
}
