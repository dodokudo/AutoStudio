import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/youtube/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('YouTube OAuth credentials are not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(oauth2Client: OAuth2Client): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(oauth2Client: OAuth2Client, code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

export function setRefreshToken(oauth2Client: OAuth2Client, refreshToken: string) {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
}

export async function refreshAccessToken(oauth2Client: OAuth2Client) {
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  return credentials;
}