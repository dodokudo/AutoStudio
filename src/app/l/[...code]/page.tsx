import { notFound, redirect } from 'next/navigation';
import { getShortLinkByCode, logClick } from '@/lib/links/bigquery';
import { headers } from 'next/headers';
import { after } from 'next/server';

interface PageProps {
  params: Promise<{ code: string[] }>;
}

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

export default async function ShortLinkRedirect({ params }: PageProps) {
  const { code: codeSegments } = await params;
  const code = codeSegments.join('/');

  // 短縮URLを取得
  const shortLink = await getShortLinkByCode(code);

  if (!shortLink) {
    notFound();
  }

  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const referrer = headersList.get('referer') || undefined;
  const forwardedFor = headersList.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : undefined;

  const isBot = isCrawlerUserAgent(userAgent);

  if (isBot) {
    return null;
  }

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

  redirect(shortLink.destinationUrl);
}

function isCrawlerUserAgent(userAgent: string): boolean {
  if (!userAgent) return false;
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|redditbot|Applebot|Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider|Embedly|Threadsbot|Meta-ExternalAgent|LineBot|line-poker|Bytespider/i.test(userAgent);
}

// OGPメタデータ生成
export async function generateMetadata({ params }: PageProps) {
  const { code: codeSegments } = await params;
  const code = codeSegments.join('/');
  const shortLink = await getShortLinkByCode(code);

  if (!shortLink) {
    return {
      title: 'Link Not Found',
    };
  }

  return {
    title: shortLink.title || 'AutoStudio Link',
    description: shortLink.description || '',
    openGraph: {
      title: shortLink.title || 'AutoStudio Link',
      description: shortLink.description || '',
      images: shortLink.ogpImageUrl ? [shortLink.ogpImageUrl] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: shortLink.title || 'AutoStudio Link',
      description: shortLink.description || '',
      images: shortLink.ogpImageUrl ? [shortLink.ogpImageUrl] : [],
    },
  };
}
