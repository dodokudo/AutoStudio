import { redirect } from 'next/navigation';
import { getShortLinkByCode, logClick } from '@/lib/links/bigquery';
import { headers } from 'next/headers';
import RedirectClient from './redirect-client';

interface PageProps {
  params: Promise<{ code: string }>;
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

// SNSクローラーかどうかを判定
function isSNSCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const crawlers = [
    'facebookexternalhit',
    'twitterbot',
    'linkedinbot',
    'slackbot',
    'telegrambot',
    'whatsapp',
    'discordbot',
    'threads', // Threadsのクローラー
    'barcelona', // ThreadsのUA
    'instagram',
  ];
  return crawlers.some(crawler => ua.includes(crawler));
}

export default async function ShortLinkRedirect({ params }: PageProps) {
  const { code } = await params;

  // 短縮URLを取得
  const shortLink = await getShortLinkByCode(code);

  if (!shortLink) {
    redirect('/404');
  }

  // クリック情報を記録（非同期で実行、リダイレクトをブロックしない）
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const referrer = headersList.get('referer') || undefined;
  const forwardedFor = headersList.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : undefined;

  // クリックログを記録（await しない）
  logClick(shortLink.id, {
    referrer,
    userAgent,
    ipAddress,
    deviceType: getDeviceType(userAgent),
  }).catch((error) => {
    console.error('Failed to log click:', error);
  });

  // SNSクローラーの場合は何も返さない（generateMetadataだけが使われる）
  if (isSNSCrawler(userAgent)) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <p>リダイレクト中...</p>
        <noscript>
          <meta httpEquiv="refresh" content={`0;url=${shortLink.destinationUrl}`} />
        </noscript>
      </div>
    );
  }

  // 通常のブラウザの場合はクライアントサイドリダイレクト
  return <RedirectClient destinationUrl={shortLink.destinationUrl} />;
}

// OGPメタデータ生成
export async function generateMetadata({ params }: PageProps) {
  const { code } = await params;
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
