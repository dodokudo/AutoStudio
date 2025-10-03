import { NextRequest, NextResponse } from 'next/server';
import { updateShortLink } from '@/lib/links/bigquery';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();

    await updateShortLink(id, {
      destinationUrl: body.destinationUrl,
      title: body.title,
      description: body.description,
      ogpImageUrl: body.ogpImageUrl,
      managementName: body.managementName,
      category: body.category,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update short link:', error);
    return NextResponse.json({ error: 'Failed to update short link' }, { status: 500 });
  }
}
