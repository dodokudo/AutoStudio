import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/youtube/callback`;

export async function GET() {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'YouTube OAuth credentials not configured' },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[youtube/auth] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}