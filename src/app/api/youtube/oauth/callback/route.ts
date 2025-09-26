import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client, exchangeCodeForTokens } from '@/lib/youtube/oauth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/youtube?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/youtube?error=no_code', request.url));
  }

  try {
    const oauth2Client = createOAuth2Client();
    const tokens = await exchangeCodeForTokens(oauth2Client, code);

    // リフレッシュトークンをセキュアに保存する必要があります
    // 本番環境では暗号化してデータベースに保存
    const refreshToken = tokens.refresh_token;

    if (refreshToken) {
      // 本来はデータベースに保存すべきですが、デモ用にログ出力
      console.log('YouTube OAuth Refresh Token:', refreshToken);
      console.log('この値を YOUTUBE_OAUTH_REFRESH_TOKEN 環境変数に設定してください');
    }

    // 成功時はYouTubeダッシュボードにリダイレクト
    return NextResponse.redirect(new URL('/youtube?oauth=success', request.url));

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/youtube?error=${encodeURIComponent('token_exchange_failed')}`, request.url)
    );
  }
}