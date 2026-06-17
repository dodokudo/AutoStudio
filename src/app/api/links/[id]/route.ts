import { NextRequest, NextResponse } from 'next/server';
import { updateShortLink } from '@/lib/links/bigquery';
import { syncShortLinksToEdgeConfig } from '@/lib/links/edgeConfigSync';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const shortLink = await updateShortLink(id, {
      destinationUrl: body.destinationUrl,
      title: body.title,
      description: body.description,
      ogpImageUrl: body.ogpImageUrl,
      managementName: body.managementName,
      category: body.category,
    });

    const edgeSync = await syncShortLinksToEdgeConfig([shortLink]);

    return NextResponse.json({ success: true, edgeSynced: edgeSync.synced });
  } catch (error) {
    console.error('Failed to update short link:', error);
    return NextResponse.json({ error: 'Failed to update short link' }, { status: 500 });
  }
}
