import { NextResponse } from 'next/server';
import { createOAuth2Client, setRefreshToken, refreshAccessToken } from '@/lib/youtube/oauth';
import { getChannelAnalyticsSummary } from '@/lib/youtube/analytics';

export async function GET() {
  try {
    const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
    const channelId = process.env.YOUTUBE_CHANNEL_ID;

    if (!refreshToken) {
      return NextResponse.json(
        {
          error: 'OAuth認証が必要です',
          needsAuth: true,
          authUrl: '/api/youtube/oauth/auth'
        },
        { status: 401 }
      );
    }

    if (!channelId) {
      return NextResponse.json(
        { error: 'チャンネルIDが設定されていません' },
        { status: 400 }
      );
    }

    const oauth2Client = createOAuth2Client();
    setRefreshToken(oauth2Client, refreshToken);

    // アクセストークンを取得・更新
    await refreshAccessToken(oauth2Client);

    // Analytics データを取得
    const analyticsData = await getChannelAnalyticsSummary(oauth2Client, channelId);

    return NextResponse.json({
      success: true,
      data: analyticsData,
      channelId,
    });

  } catch (error) {
    console.error('YouTube Analytics API error:', error);

    // 認証エラーの場合
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      return NextResponse.json(
        {
          error: 'OAuth認証の有効期限が切れています',
          needsAuth: true,
          authUrl: '/api/youtube/oauth/auth'
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'YouTube Analytics データの取得に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー'
      },
      { status: 500 }
    );
  }
}