import { NextRequest, NextResponse } from 'next/server';
import { recordEvent, LaunchkitEventType } from '@/lib/launchkit/bigquery';

const ALLOWED_ORIGINS = [
  'https://lkit.jp',
  'https://www.lkit.jp',
  'http://localhost:3000',
  'http://localhost:8080',
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/launchkit-[a-z0-9-]+-kudos-projects-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/launchkit-git-[a-z0-9-]+-kudos-projects-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/launchkit-[a-z0-9]+\.vercel\.app$/,
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
  return 'Desktop';
}

function isCrawlerUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|redditbot|Applebot|Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider|Embedly|Threadsbot|Meta-ExternalAgent|LineBot|line-poker|Bytespider/i.test(userAgent);
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  try {
    const body = await request.json();
    const lpId = typeof body.lpId === 'string' ? body.lpId.trim() : '';
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';
    if (!lpId) {
      return NextResponse.json({ error: 'lpId is required' }, { status: 400, headers });
    }
    const allowedEventTypes = ['page_view', 'line_cta_click', 'chapter_view', 'cta_click'];
    if (!allowedEventTypes.includes(eventType)) {
      return NextResponse.json({ error: 'invalid eventType' }, { status: 400, headers });
    }

    const userAgent = request.headers.get('user-agent') || '';
    if (isCrawlerUserAgent(userAgent)) {
      return NextResponse.json({ ok: true, skipped: 'bot' }, { headers });
    }

    const referer = request.headers.get('referer') || undefined;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined;

    const utm = (body.utm && typeof body.utm === 'object') ? body.utm : {};

    await recordEvent({
      lpId,
      eventType: eventType as LaunchkitEventType,
      url: typeof body.url === 'string' ? body.url : undefined,
      referrer: referer,
      userAgent,
      ipAddress,
      deviceType: getDeviceType(userAgent),
      utmSource: typeof utm.source === 'string' ? utm.source : undefined,
      utmMedium: typeof utm.medium === 'string' ? utm.medium : undefined,
      utmCampaign: typeof utm.campaign === 'string' ? utm.campaign : undefined,
      fbclid: typeof body.fbclid === 'string' ? body.fbclid : undefined,
    });

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error('[launchkit/events POST]', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers });
  }
}
