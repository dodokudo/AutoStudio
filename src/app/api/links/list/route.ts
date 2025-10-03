import { NextResponse } from 'next/server';
import { getAllShortLinks } from '@/lib/links/bigquery';

export async function GET() {
  try {
    const links = await getAllShortLinks();
    return NextResponse.json(links, { status: 200 });
  } catch (error) {
    console.error('[links/list] failed', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}
