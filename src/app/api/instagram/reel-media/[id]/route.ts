import { NextRequest, NextResponse } from 'next/server';
import { getInstagramAccessContext } from '@/lib/instagram/auth';

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? `https://graph.facebook.com/${GRAPH_VERSION}`;

interface Params {
  params: Promise<{ id: string }>;
}

interface InstagramMediaResponse {
  id: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    }

    const context = await getInstagramAccessContext();
    const url = new URL(`${GRAPH_BASE}/${id}`);
    url.searchParams.set('fields', 'id,permalink,thumbnail_url,media_url');
    url.searchParams.set('access_token', context.accessToken);

    const response = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!response.ok) {
      const body = await response.text();
      console.error('[api/instagram/reel-media] Graph API failed:', response.status, body.slice(0, 500));
      return NextResponse.json({ error: 'graph_failed' }, { status: response.status });
    }

    const media = await response.json() as InstagramMediaResponse;
    return NextResponse.json({
      id: media.id,
      permalink: media.permalink ?? null,
      thumbnailUrl: media.thumbnail_url ?? null,
      mediaUrl: media.media_url ?? null,
    });
  } catch (error) {
    console.error('[api/instagram/reel-media]', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
