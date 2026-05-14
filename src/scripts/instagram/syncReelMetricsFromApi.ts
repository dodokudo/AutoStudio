import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import {
  buildSnapshotRows,
  fetchRecentReels,
  insertReelMetricSnapshots,
  probeReelMetrics,
} from '@/lib/instagram/reelMetrics';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

function parseLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(Math.floor(parsed), 25);
}

function isProbeOnly(): boolean {
  return process.argv.includes('probe') || process.env.IG_REEL_METRICS_PROBE_ONLY === 'true';
}

async function main() {
  const selector = process.env.IG_ANALYCA_USER_ID ?? process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
  const limit = parseLimit(process.env.IG_REEL_METRICS_LIMIT);
  const context = await getInstagramAccessContext(selector);

  console.log('[sync-reel-metrics] Instagram context loaded:', {
    source: context.source,
    analycaUserId: context.analycaUserId,
    autostudioUserId: context.autostudioUserId,
    instagramUserId: context.instagramUserId,
    instagramUsername: context.instagramUsername,
    tokenExpiresAt: context.tokenExpiresAt,
  });

  const reels = await fetchRecentReels(context, limit);
  console.log(`[sync-reel-metrics] Fetched ${reels.length} reels from recent ${limit} media items.`);

  if (!reels.length) {
    return;
  }

  const probeResults = [];
  for (const reel of reels) {
    const result = await probeReelMetrics(context, reel);
    probeResults.push(result);
    console.log('[sync-reel-metrics] Probed reel:', {
      instagramId: reel.id,
      supported: Object.keys(result.supportedMetrics).filter((key) => result.supportedMetrics[key] !== null),
      unsupported: result.unsupportedMetrics,
    });
  }

  if (isProbeOnly()) {
    console.log('[sync-reel-metrics] Probe only mode enabled. Skipping BigQuery insert.');
    return;
  }

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);

  const storage = getInstagramStorageConfig();
  const rows = buildSnapshotRows(context, probeResults);
  await insertReelMetricSnapshots(bigquery, storage.projectId, storage.dataset, storage.location, rows);

  console.log(`[sync-reel-metrics] Inserted ${rows.length} reel metric snapshots.`);
}

main().catch((error) => {
  console.error('[sync-reel-metrics] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('[sync-reel-metrics] Insert errors detail:', JSON.stringify((error as { errors: unknown }).errors, null, 2));
  }
  process.exitCode = 1;
});
