import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { EDGE_SHORT_LINKS, type EdgeShortLink } from '@/lib/links/edgeRedirectMap';

const PUBLIC_PATHS = [
  '/l/',
  '/login',
  '/api/auth/',
  '/api/cron/',
  '/api/ads/cron/',
  '/api/threads/cron/',
  '/api/threads/schedule/run',
  '/api/threads/auto-comment/check',
  '/api/threads/comments/execute',
  '/api/sales/cron/',
  '/api/launchkit/events',
  '/api/agency/public',
  '/api/links/click',
];

function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'Mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'Tablet';
  }
  return 'Desktop';
}

function isCrawlerUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|redditbot|Applebot|Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider|Embedly|Threadsbot|Meta-ExternalAgent|LineBot|line-poker|Bytespider/i.test(userAgent);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOgpHtml(shortLink: EdgeShortLink): string {
  const title = escapeHtml(shortLink.title || 'AutoStudio Link');
  const description = escapeHtml(shortLink.description || '');
  const image = shortLink.ogpImageUrl ? escapeHtml(shortLink.ogpImageUrl) : '';
  const imageMeta = image
    ? `<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}">`
    : '';

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">${imageMeta}</head><body></body></html>`;
}

function getShortLinkFromEdgeMap(pathname: string): EdgeShortLink | null {
  if (!pathname.startsWith('/l/')) return null;
  const code = decodeURIComponent(pathname.slice('/l/'.length).replace(/\/$/, ''));
  return EDGE_SHORT_LINKS[code] ?? null;
}

function logShortLinkClick(request: NextRequest, event: NextFetchEvent, shortLink: EdgeShortLink): void {
  const userAgent = request.headers.get('user-agent') || '';
  const forwardedFor = request.headers.get('x-forwarded-for');
  const endpoint = new URL('/api/links/click', request.url);

  event.waitUntil(
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shortLinkId: shortLink.id,
        referrer: request.headers.get('referer') || undefined,
        userAgent,
        ipAddress: forwardedFor ? forwardedFor.split(',')[0] : undefined,
        deviceType: getDeviceType(userAgent),
      }),
    }).catch((error) => {
      console.error('Failed to log short link click:', error);
    }),
  );
}

function handleShortLink(request: NextRequest, event: NextFetchEvent): NextResponse | null {
  const shortLink = getShortLinkFromEdgeMap(request.nextUrl.pathname);
  if (!shortLink) return null;

  const userAgent = request.headers.get('user-agent') || '';
  if (isCrawlerUserAgent(userAgent)) {
    return new NextResponse(buildOgpHtml(shortLink), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    });
  }

  logShortLinkClick(request, event, shortLink);
  return NextResponse.redirect(shortLink.destinationUrl, {
    status: 307,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  const shortLinkResponse = handleShortLink(request, event);
  if (shortLinkResponse) {
    return shortLinkResponse;
  }

  // Public paths - skip auth
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authToken = request.cookies.get('auth-token');
  if (authToken?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
