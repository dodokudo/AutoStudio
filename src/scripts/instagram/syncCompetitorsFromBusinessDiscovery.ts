import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';

const GCS_BUCKET = process.env.IG_COMPETITOR_MEDIA_BUCKET ?? 'autostudio-instagram-media';

async function uploadVideoToGcs(mediaUrl: string, username: string, mediaId: string): Promise<string | null> {
  try {
    const objectName = `competitors/${username}/${mediaId}.mp4`;
    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (exists) {
      return `https://storage.googleapis.com/${GCS_BUCKET}/${objectName}`;
    }
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.warn(`[sync-competitors-bd] media download failed ${response.status} for ${mediaId}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await file.save(buffer, {
      contentType: 'video/mp4',
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
    return `https://storage.googleapis.com/${GCS_BUCKET}/${objectName}`;
  } catch (error) {
    console.warn(`[sync-competitors-bd] uploadVideoToGcs failed for ${mediaId}:`, error);
    return null;
  }
}

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MEDIA_LIMIT = Number(process.env.IG_COMPETITOR_MEDIA_LIMIT ?? '30');

interface BusinessDiscoveryMedia {
  id: string;
  caption?: string;
  comments_count?: number;
  like_count?: number;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  view_count?: number;
}

interface BusinessDiscoveryResult {
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  name?: string;
  username?: string;
  media?: { data?: BusinessDiscoveryMedia[] };
  error?: { message: string; code: number };
}

interface GraphErrorResp {
  error?: { message: string; code: number };
}

async function fetchBusinessDiscovery(
  igUserId: string,
  username: string,
  accessToken: string,
): Promise<BusinessDiscoveryResult | null> {
  const fields = `business_discovery.username(${username}){followers_count,follows_count,media_count,name,username,media.limit(${MEDIA_LIMIT}){id,caption,comments_count,like_count,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,view_count}}`;
  const url = new URL(`${GRAPH_BASE}/${igUserId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', accessToken);
  try {
    const response = await fetch(url.toString());
    const json = await response.json();
    if (!response.ok || (json as GraphErrorResp).error) {
      console.warn(`[business-discovery] ${username}: ${response.status} ${JSON.stringify((json as GraphErrorResp).error ?? json).slice(0, 200)}`);
      return null;
    }
    const wrapped = json as { business_discovery?: BusinessDiscoveryResult };
    return wrapped.business_discovery ?? null;
  } catch (error) {
    console.warn(`[business-discovery] ${username} fetch error:`, error);
    return null;
  }
}

async function main() {
  const context = await getInstagramAccessContext('kudooo_ai');
  console.log('[sync-competitors-bd] context:', { source: context.source, igUserId: context.instagramUserId });

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const { projectId, dataset } = getInstagramStorageConfig();

  // 1. competitor リスト取得
  const [competitors] = await bigquery.query({
    query: `SELECT username FROM \`${projectId}.${dataset}.instagram_competitors_private\` WHERE active = TRUE OR active IS NULL`,
  });
  const usernames = (competitors as Array<{ username: string }>).map((r) => r.username).filter(Boolean);
  console.log(`[sync-competitors-bd] ${usernames.length} competitors to fetch`);

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const accountHistoryRows: Record<string, unknown>[] = [];
  const reelRows: Record<string, unknown>[] = [];

  // 2. 各 username に対して Business Discovery
  for (const username of usernames) {
    const result = await fetchBusinessDiscovery(context.instagramUserId, username, context.accessToken);
    if (!result) {
      console.warn(`[sync-competitors-bd] ${username}: skipped (no result, likely shadowban or private)`);
      continue;
    }
    console.log(`[sync-competitors-bd] ${username}: followers=${result.followers_count}, media=${result.media?.data?.length ?? 0}`);

    accountHistoryRows.push({
      date: today,
      username,
      account_url: `https://www.instagram.com/${username}/`,
      followers_count: result.followers_count ?? null,
      follows_count: result.follows_count ?? null,
      media_count: result.media_count ?? null,
      created_at: nowIso,
    });

    const reels = (result.media?.data ?? []).filter(
      (m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO',
    );
    // メタデータのみ即投入。動画 upload は IG_DOWNLOAD_VIDEOS=true 時のみ
    const downloadEnabled = process.env.IG_DOWNLOAD_VIDEOS === 'true';
    const gcsUrls = downloadEnabled
      ? await Promise.all(
          reels.map((reel) => (reel.media_url ? uploadVideoToGcs(reel.media_url, username, reel.id) : Promise.resolve(null))),
        )
      : reels.map(() => null);
    reels.forEach((reel, idx) => {
      const gcsUrl = gcsUrls[idx];
      reelRows.push({
        snapshot_date: today,
        username,
        instagram_media_id: reel.id,
        drive_file_id: gcsUrl ? `gcs:${reel.id}` : reel.id,
        drive_file_url: gcsUrl ?? (reel.permalink ?? `https://www.instagram.com/reel/${reel.id}/`),
        caption: reel.caption ?? null,
        permalink: reel.permalink ?? `https://www.instagram.com/${username}/`,
        media_type: reel.media_product_type ?? reel.media_type ?? 'REELS',
        posted_at: reel.timestamp ?? new Date().toISOString(),
        created_at: nowIso,
        sheet_caption: reel.caption ?? null,
        view_count: reel.view_count ?? null,
        like_count: reel.like_count ?? null,
        comments_count: reel.comments_count ?? null,
      });
    });
    // レート対策
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  // 3. account history insert (streaming buffer 制約のため、既存の today+username をスキップ)
  if (accountHistoryRows.length) {
    const [existing] = await bigquery.query({
      query: `SELECT username FROM \`${projectId}.${dataset}.instagram_competitor_account_history\` WHERE date = '${today}'`,
    });
    const existingUsers = new Set((existing as Array<{ username: string }>).map((r) => r.username));
    const newHistory = accountHistoryRows.filter((r) => !existingUsers.has(r.username as string));
    if (newHistory.length) {
      await bigquery.dataset(dataset).table('instagram_competitor_account_history').insert(newHistory);
      console.log(`[sync-competitors-bd] inserted ${newHistory.length} account history rows`);
    } else {
      console.log('[sync-competitors-bd] account history already up to date');
    }
  }

  // 4. reels insert (snapshot_date=today で重複スキップ)
  if (reelRows.length) {
    const [existingReels] = await bigquery.query({
      query: `SELECT instagram_media_id FROM \`${projectId}.${dataset}.competitor_reels_raw\` WHERE snapshot_date = '${today}'`,
    });
    const existingIds = new Set((existingReels as Array<{ instagram_media_id: string }>).map((r) => r.instagram_media_id));
    const newReels = reelRows.filter((r) => !existingIds.has(r.instagram_media_id as string));
    if (newReels.length) {
      const chunkSize = 500;
      for (let i = 0; i < newReels.length; i += chunkSize) {
        await bigquery.dataset(dataset).table('competitor_reels_raw').insert(newReels.slice(i, i + chunkSize));
      }
      console.log(`[sync-competitors-bd] inserted ${newReels.length} new reel rows`);
    } else {
      console.log('[sync-competitors-bd] reels already up to date for today');
    }
  }

  console.log('[sync-competitors-bd] Done.');
}

main().catch((error) => {
  console.error('[sync-competitors-bd] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('Insert errors:', JSON.stringify((error as { errors: unknown }).errors, null, 2).slice(0, 1500));
  }
  process.exitCode = 1;
});
