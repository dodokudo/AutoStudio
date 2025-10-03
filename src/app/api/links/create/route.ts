import { NextRequest, NextResponse } from 'next/server';
import { createShortLink, checkShortCodeExists } from '@/lib/links/bigquery';
import type { CreateShortLinkRequest } from '@/lib/links/types';

export async function POST(request: NextRequest) {
  try {
    const body: CreateShortLinkRequest = await request.json();

    // バリデーション
    if (!body.shortCode || !body.destinationUrl) {
      return NextResponse.json(
        { error: 'shortCode and destinationUrl are required' },
        { status: 400 }
      );
    }

    // 短縮コードの重複チェック
    const exists = await checkShortCodeExists(body.shortCode);
    if (exists) {
      return NextResponse.json({ error: 'Short code already exists' }, { status: 409 });
    }

    // 短縮URL作成
    const shortLink = await createShortLink(body);

    return NextResponse.json(shortLink, { status: 201 });
  } catch (error) {
    console.error('[links/create] failed', error);
    return NextResponse.json({ error: 'Failed to create short link' }, { status: 500 });
  }
}
