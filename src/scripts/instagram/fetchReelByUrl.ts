import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { getInstagramAccessContext } from '@/lib/instagram/auth';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const GRAPH_VERSION = 'v25.0';
const TARGET_SHORTCODES = process.argv.slice(2);

if (TARGET_SHORTCODES.length === 0) {
  console.error('Usage: tsx fetchReelByUrl.ts <shortcode1> <shortcode2> ...');
  process.exit(1);
}

interface MediaListItem {
  id: string;
  permalink: string;
  media_type?: string;
  media_product_type?: string;
  caption?: string;
  timestamp?: string;
}

async function listAllMedia(igUserId: string, token: string): Promise<MediaListItem[]> {
  const all: MediaListItem[] = [];
  let url: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media?fields=id,permalink,media_type,media_product_type,caption,timestamp&limit=100&access_token=${token}`;
  let page = 0;
  while (url) {
    page += 1;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`media list page ${page} HTTP ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { data?: MediaListItem[]; paging?: { next?: string } };
    if (json.data) all.push(...json.data);
    url = json.paging?.next ?? null;
    console.log(`[fetchReelByUrl] page ${page}: ${json.data?.length ?? 0} items (total ${all.length})`);
    if (page > 50) break;
  }
  return all;
}

async function fetchInsights(mediaId: string, token: string): Promise<Record<string, unknown> | null> {
  const metrics = [
    'reach',
    'saved',
    'likes',
    'comments',
    'shares',
    'views',
    'total_interactions',
    'ig_reels_avg_watch_time',
    'ig_reels_video_view_total_time',
  ].join(',');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights?metric=${metrics}&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  insights HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

async function fetchBasic(mediaId: string, token: string): Promise<Record<string, unknown> | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=id,permalink,timestamp,caption,media_type,media_product_type,thumbnail_url,media_url&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  basic HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const ctx = await getInstagramAccessContext();
  console.log(`[fetchReelByUrl] IG user: ${ctx.instagramUsername} (${ctx.instagramUserId})`);
  console.log(`[fetchReelByUrl] target shortcodes:`, TARGET_SHORTCODES);

  const list = await listAllMedia(ctx.instagramUserId, ctx.accessToken);
  console.log(`[fetchReelByUrl] total media fetched: ${list.length}`);

  for (const sc of TARGET_SHORTCODES) {
    const hit = list.find((m) => m.permalink?.includes(`/reel/${sc}/`) || m.permalink?.includes(`/p/${sc}/`));
    if (!hit) {
      console.log(`\n❌ shortcode ${sc}: not found in media list`);
      continue;
    }
    console.log(`\n✅ shortcode ${sc} → media_id ${hit.id}`);
    console.log(`  permalink: ${hit.permalink}`);
    console.log(`  timestamp: ${hit.timestamp}`);
    console.log(`  caption(40): ${(hit.caption ?? '').slice(0, 40)}`);

    const basic = await fetchBasic(hit.id, ctx.accessToken);
    if (basic) console.log('  basic:', JSON.stringify(basic, null, 2));

    const insights = await fetchInsights(hit.id, ctx.accessToken);
    if (insights) console.log('  insights:', JSON.stringify(insights, null, 2));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
