import { NextResponse } from 'next/server';
import { getLinkFunnel, deleteLinkFunnel } from '@/lib/links/bigquery';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const funnel = await getLinkFunnel(id);
    if (!funnel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ funnel });
  } catch (error) {
    console.error('[links/funnels/:id] GET failed', error);
    return NextResponse.json({ error: 'Failed to load funnel' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLinkFunnel(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[links/funnels/:id] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete funnel' }, { status: 500 });
  }
}
