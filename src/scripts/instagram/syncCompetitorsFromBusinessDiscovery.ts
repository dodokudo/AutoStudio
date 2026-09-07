import { config as loadEnv } from 'dotenv';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { Storage } from '@google-cloud/storage';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { selectCompetitorDownloads } from '@/lib/instagram/competitorDownloadSelection';
import { getCompetitorFacebookContext } from '@/lib/instagram/facebookBusinessAuth';

interface StoredVideo {
  fileId: string;
  url: string;
}

const storage = new Storage();
const execFileAsync = promisify(execFile);

function getGcsVideoReference(username: string, mediaId: string): StoredVideo & { objectName: string; bucketName: string } {
  const bucketName = process.env.IG_COMPETITOR_MEDIA_BUCKET?.trim() || 'autostudio-instagram-media';
  const objectName = `competitors/${username}/${mediaId}.mp4`;
  return {
    bucketName,
    objectName,
    fileId: `gcs:${bucketName}/${objectName}`,
    url: `https://storage.googleapis.com/${bucketName}/${objectName}`,
  };
}

async function findExistingGcsVideo(username: string, mediaId: string): Promise<StoredVideo | null> {
  const reference = getGcsVideoReference(username, mediaId);
  const [exists] = await storage.bucket(reference.bucketName).file(reference.objectName).exists();
  return exists ? { fileId: reference.fileId, url: reference.url } : null;
}

async function resolvePublicReelVideoUrl(permalink: string, mediaId: string): Promise<string | null> {
  try {
    const cookiesFromBrowser = process.env.IG_YTDLP_COOKIES_FROM_BROWSER?.trim();
    const args = ['--no-warnings', '--no-playlist'];
    if (cookiesFromBrowser) args.push('--cookies-from-browser', cookiesFromBrowser);
    args.push('--get-url', '--format', 'best[ext=mp4]/best', permalink);
    const { stdout } = await execFileAsync(
      'yt-dlp',
      args,
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    return stdout.split('\n').map((line) => line.trim()).find((line) => line.startsWith('https://')) ?? null;
  } catch (error) {
    console.warn(`[sync-competitors-bd] yt-dlp URL resolution failed for ${mediaId}:`, error);
    return null;
  }
}

async function uploadVideoToGcs(
  mediaUrl: string,
  username: string,
  mediaId: string,
): Promise<StoredVideo | null> {
  try {
    const reference = getGcsVideoReference(username, mediaId);
    const file = storage.bucket(reference.bucketName).file(reference.objectName);
    const [exists] = await file.exists();
    if (exists) return { fileId: reference.fileId, url: reference.url };

    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.warn(`[sync-competitors-bd] media download failed ${response.status} for ${mediaId}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await file.save(buffer, {
      resumable: false,
      contentType: response.headers.get('content-type') || 'video/mp4',
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
    return { fileId: reference.fileId, url: reference.url };
  } catch (error) {
    console.warn(`[sync-competitors-bd] uploadVideoToGcs failed for ${mediaId}:`, error);
    return null;
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await worker(item);
      }
    }),
  );
}

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MEDIA_LIMIT = Number(process.env.IG_COMPETITOR_MEDIA_LIMIT ?? '30');
const DOWNLOAD_LIMIT = Number(process.env.IG_COMPETITOR_DOWNLOAD_LIMIT ?? '60');
const DOWNLOAD_MIN_PER_ACCOUNT = Number(process.env.IG_COMPETITOR_DOWNLOAD_MIN_PER_ACCOUNT ?? '5');
const DOWNLOAD_CONCURRENCY = Number(process.env.IG_COMPETITOR_DOWNLOAD_CONCURRENCY ?? '3');
const DOWNLOAD_FROM_DATE = process.env.IG_COMPETITOR_FROM_DATE?.trim() || null;
const DOWNLOAD_TO_DATE = process.env.IG_COMPETITOR_TO_DATE?.trim() || null;

function isWithinDownloadRange(postedAt: string | null): boolean {
  if (!postedAt) return false;
  const timestamp = new Date(postedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const from = DOWNLOAD_FROM_DATE
    ? new Date(`${DOWNLOAD_FROM_DATE}T00:00:00+09:00`).getTime()
    : null;
  const to = DOWNLOAD_TO_DATE
    ? new Date(`${DOWNLOAD_TO_DATE}T23:59:59.999+09:00`).getTime()
    : null;
  return (from == null || timestamp >= from) && (to == null || timestamp <= to);
}

// Instagram API は '2025-10-22T12:05:33+0000' 形式を返す。
// BigQuery TIMESTAMP は +0000（コロン無し）を解釈できないため ISO8601 に正規化する。
function normalizeTimestamp(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

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

interface ReelCandidate {
  mediaUrl: string | null;
  permalink: string;
  row: Record<string, unknown>;
  instagramMediaId: string;
  postedAt: string | null;
  username: string;
  viewCount: number | null;
}

interface GraphErrorResp {
  error?: { message: string; code: number; type?: string };
}

class BusinessDiscoveryAuthError extends Error {}

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
      const graphError = (json as GraphErrorResp).error;
      if (graphError?.code === 10 || graphError?.code === 190) {
        throw new BusinessDiscoveryAuthError(
          `[business-discovery] ${username}: ${response.status} code=${graphError.code} ${graphError.message}`,
        );
      }
      console.warn(`[business-discovery] ${username}: ${response.status} ${JSON.stringify(graphError ?? json).slice(0, 200)}`);
      return null;
    }
    const wrapped = json as { business_discovery?: BusinessDiscoveryResult };
    return wrapped.business_discovery ?? null;
  } catch (error) {
    if (error instanceof BusinessDiscoveryAuthError) throw error;
    console.warn(`[business-discovery] ${username} fetch error:`, error);
    return null;
  }
}

async function main() {
  const context = await getCompetitorFacebookContext();
  console.log('[sync-competitors-bd] context:', {
    source: context.source,
    igUserId: context.instagramUserId,
    instagramUsername: context.instagramUsername,
    pageId: context.pageId,
    tokenWasExchanged: context.tokenWasExchanged,
    tokenExpiresAt: context.tokenExpiresAt,
    tokenDataAccessExpiresAt: context.tokenDataAccessExpiresAt,
  });

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
  const reelCandidates: ReelCandidate[] = [];

  // 2. 各 username に対して Business Discovery
  for (const username of usernames) {
    let result: BusinessDiscoveryResult | null;
    try {
      result = await fetchBusinessDiscovery(context.instagramUserId, username, context.accessToken);
    } catch (error) {
      if (error instanceof BusinessDiscoveryAuthError) throw error;
      console.warn(`[sync-competitors-bd] ${username}: fetch failed`, error);
      continue;
    }
    if (!result) {
      console.warn(`[sync-competitors-bd] ${username}: skipped (no result, likely shadowban or private)`);
      continue;
    }
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
    console.log(
      `[sync-competitors-bd] ${username}: followers=${result.followers_count}, media=${result.media?.data?.length ?? 0}, reels=${reels.length}, sourceUrls=${reels.filter((reel) => reel.media_url).length}`,
    );
    reels.forEach((reel) => {
      const postedAt = normalizeTimestamp(reel.timestamp) ?? nowIso;
      reelCandidates.push({
        mediaUrl: reel.media_url ?? null,
        instagramMediaId: reel.id,
        permalink: reel.permalink ?? `https://www.instagram.com/reel/${reel.id}/`,
        postedAt,
        username,
        viewCount: reel.view_count ?? null,
        row: {
          snapshot_date: today,
          username,
          instagram_media_id: reel.id,
          drive_file_id: `instagram:${reel.id}`,
          drive_file_url: reel.permalink ?? `https://www.instagram.com/reel/${reel.id}/`,
          caption: reel.caption ?? null,
          permalink: reel.permalink ?? `https://www.instagram.com/${username}/`,
          media_type: reel.media_product_type ?? reel.media_type ?? 'REELS',
          posted_at: postedAt,
          created_at: nowIso,
          sheet_caption: reel.caption ?? null,
          view_count: reel.view_count ?? null,
          like_count: reel.like_count ?? null,
          comments_count: reel.comments_count ?? null,
        },
      });
    });
    // レート対策
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  if (usernames.length > 0 && accountHistoryRows.length === 0) {
    throw new Error(
      'Business Discovery returned no competitor accounts; refusing to report a successful sync',
    );
  }

  const storedVideos = new Map<string, StoredVideo>();
  const downloadCandidates = DOWNLOAD_FROM_DATE || DOWNLOAD_TO_DATE
    ? reelCandidates.filter((candidate) => isWithinDownloadRange(candidate.postedAt))
    : reelCandidates;
  const selectedDownloads = process.env.IG_DOWNLOAD_VIDEOS === 'true'
    ? selectCompetitorDownloads(downloadCandidates, DOWNLOAD_LIMIT, DOWNLOAD_MIN_PER_ACCOUNT, 'newest')
    : [];
  if (selectedDownloads.length) {
    console.log(
      `[sync-competitors-bd] downloading ${selectedDownloads.length} selected reels to GCS`,
    );
    await mapWithConcurrency(selectedDownloads, DOWNLOAD_CONCURRENCY, async (candidate) => {
      const existing = await findExistingGcsVideo(candidate.username, candidate.instagramMediaId);
      if (existing) {
        storedVideos.set(candidate.instagramMediaId, existing);
        return;
      }
      const sourceUrl = candidate.mediaUrl
        ?? await resolvePublicReelVideoUrl(candidate.permalink, candidate.instagramMediaId);
      if (!sourceUrl) return;
      let stored = await uploadVideoToGcs(
        sourceUrl,
        candidate.username,
        candidate.instagramMediaId,
      );
      if (!stored && candidate.mediaUrl) {
        const fallbackUrl = await resolvePublicReelVideoUrl(candidate.permalink, candidate.instagramMediaId);
        if (fallbackUrl && fallbackUrl !== sourceUrl) {
          stored = await uploadVideoToGcs(
            fallbackUrl,
            candidate.username,
            candidate.instagramMediaId,
          );
        }
      }
      if (stored) storedVideos.set(candidate.instagramMediaId, stored);
    });
    const selectedStoredCount = selectedDownloads.filter((candidate) => storedVideos.has(candidate.instagramMediaId)).length;
    if (selectedStoredCount !== selectedDownloads.length) {
      console.warn(
        `[sync-competitors-bd] GCS download incomplete: ${selectedStoredCount}/${selectedDownloads.length} videos saved`,
      );
    }
    console.log(`[sync-competitors-bd] saved ${selectedStoredCount} selected videos to GCS`);
  }
  const reelRows = reelCandidates.map((candidate) => {
    const stored = selectedDownloads.some((selected) => selected.instagramMediaId === candidate.instagramMediaId)
      ? storedVideos.get(candidate.instagramMediaId)
      : null;
    return stored
      ? { ...candidate.row, drive_file_id: stored.fileId, drive_file_url: stored.url }
      : candidate.row;
  });

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
      query: `SELECT instagram_media_id, LOGICAL_OR(REGEXP_CONTAINS(drive_file_url, r'(drive\\.google\\.com|storage\\.googleapis\\.com)')) AS saved_to_storage FROM \`${projectId}.${dataset}.competitor_reels_raw\` WHERE snapshot_date = '${today}' GROUP BY instagram_media_id`,
    });
    const existing = new Map(
      (existingReels as Array<{ instagram_media_id: string; saved_to_storage: boolean }>).map((row) => [
        row.instagram_media_id,
        row.saved_to_storage,
      ]),
    );
    const newReels = reelRows.filter((row) => {
      const existingStoredCopy = existing.get(row.instagram_media_id as string);
      const storageUrl = String(row.drive_file_url ?? '');
      const rowHasStoredCopy = storageUrl.includes('drive.google.com') || storageUrl.includes('storage.googleapis.com');
      return existingStoredCopy === undefined || (rowHasStoredCopy && !existingStoredCopy);
    });
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
