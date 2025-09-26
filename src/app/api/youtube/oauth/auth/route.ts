import { NextResponse } from 'next/server';
import { createOAuth2Client, getAuthUrl } from '@/lib/youtube/oauth';

export async function GET() {
  try {
    const oauth2Client = createOAuth2Client();
    const authUrl = getAuthUrl(oauth2Client);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('OAuth auth URL generation error:', error);
    return NextResponse.json(
      { error: 'OAuth設定が不完全です。環境変数を確認してください。' },
      { status: 500 }
    );
  }
}