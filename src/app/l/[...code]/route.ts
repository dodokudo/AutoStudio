import { after, NextRequest, NextResponse } from 'next/server';
import { getShortLinkByCode, logClick } from '@/lib/links/bigquery';

interface RouteContext {
  params: Promise<{ code: string[] }>;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function buildOgpHtml(shortLink: Awaited<ReturnType<typeof getShortLinkByCode>>): string {
  if (!shortLink) {
    return '<!doctype html><html><head><title>Link Not Found</title></head><body></body></html>';
  }

  const title = escapeHtml(shortLink.title || 'AutoStudio Link');
  const description = escapeHtml(shortLink.description || '');
  const image = shortLink.ogpImageUrl ? escapeHtml(shortLink.ogpImageUrl) : '';
  const imageMeta = image
    ? `<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}">`
    : '';

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">${imageMeta}</head><body></body></html>`;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { code: codeSegments } = await context.params;
  const code = codeSegments.join('/');
  const shortLink = await getShortLinkByCode(code);

  if (!shortLink) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const userAgent = request.headers.get('user-agent') || '';

  if (isCrawlerUserAgent(userAgent)) {
    return new NextResponse(buildOgpHtml(shortLink), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const referrer = request.headers.get('referer') || undefined;
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : undefined;

  after(() => {
    logClick(shortLink.id, {
      referrer,
      userAgent,
      ipAddress,
      deviceType: getDeviceType(userAgent),
    }).catch((error) => {
      console.error('Failed to log click:', error);
    });
  });

  return NextResponse.redirect(shortLink.destinationUrl, {
    status: 307,
    headers: {
      'cache-control': 'no-store',
    },
  });
}
