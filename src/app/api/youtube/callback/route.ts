import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/youtube/callback`;

export async function GET(request: NextRequest) {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'YouTube OAuth credentials not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('[youtube/callback] OAuth error:', error);
      return NextResponse.redirect(`${request.nextUrl.origin}/youtube?error=${error}`);
    }

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code not found' },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Store the refresh token for future use
    const refreshToken = tokens.refresh_token;
    if (refreshToken) {
      console.log('Refresh token obtained:', refreshToken);
      // TODO: Store this securely in environment variables for production use
      console.log('Add this to your Vercel environment variables:');
      console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN=${refreshToken}`);
    }

    // Test the API connection
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelResponse = await youtube.channels.list({
      part: ['snippet'],
      mine: true
    });

    const channelTitle = channelResponse.data.items?.[0]?.snippet?.title;

    return NextResponse.redirect(
      `${request.nextUrl.origin}/youtube?success=true&channel=${encodeURIComponent(channelTitle || 'Unknown')}`
    );
  } catch (error) {
    console.error('[youtube/callback] Error:', error);
    return NextResponse.redirect(
      `${request.nextUrl.origin}/youtube?error=${encodeURIComponent((error as Error).message)}`
    );
  }
}