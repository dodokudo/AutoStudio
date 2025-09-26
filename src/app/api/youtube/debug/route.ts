import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

export async function GET() {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'YouTube OAuth credentials not configured' },
        { status: 500 }
      );
    }

    if (!REFRESH_TOKEN) {
      return NextResponse.json({
        message: 'YOUTUBE_OAUTH_REFRESH_TOKEN not set. Please complete OAuth flow first.',
        authUrl: '/api/youtube/auth'
      });
    }

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true
    });

    const channel = channelResponse.data.items?.[0];

    return NextResponse.json({
      channelInfo: {
        channelId: channel?.id,
        channelTitle: channel?.snippet?.title,
        customUrl: channel?.snippet?.customUrl,
        subscriberCount: channel?.statistics?.subscriberCount,
        videoCount: channel?.statistics?.videoCount
      },
      environmentVars: {
        YOUTUBE_CHANNEL_ID: channel?.id || 'NOT_SET',
        YOUTUBE_OAUTH_REFRESH_TOKEN: REFRESH_TOKEN ? 'SET' : 'NOT_SET'
      }
    });
  } catch (error) {
    console.error('[youtube/debug] Error:', error);
    return NextResponse.json(
      {
        error: (error as Error).message,
        message: 'OAuth token may have expired. Try re-authenticating.',
        authUrl: '/api/youtube/auth'
      },
      { status: 500 }
    );
  }
}