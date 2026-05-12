import { NextRequest, NextResponse } from 'next/server';
import { getLP, updateLP, deactivateLP } from '@/lib/launchkit/bigquery';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lp = await getLP(id);
    if (!lp) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ lp });
  } catch (error) {
    console.error('[launchkit/lps/:id GET]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const lp = await updateLP(id, {
      name: body.name,
      slug: body.slug,
      url: body.url,
      genre: body.genre,
      source: body.source,
      lineCtaUrl: body.line_cta_url ?? body.lineCtaUrl,
      isActive: body.is_active ?? body.isActive,
    });
    return NextResponse.json({ lp });
  } catch (error) {
    console.error('[launchkit/lps/:id PATCH]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deactivateLP(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[launchkit/lps/:id DELETE]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
