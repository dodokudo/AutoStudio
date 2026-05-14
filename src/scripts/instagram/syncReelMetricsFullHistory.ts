import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import {
  buildSnapshotRows,
  fetchAllReelsSince,
  insertReelMetricSnapshots,
  probeReelMetrics,
} from '@/lib/instagram/reelMetrics';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

function parseDaysArg(): number {
  const days = Number(process.env.IG_HISTORY_DAYS ?? process.argv[2] ?? '365');
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 365;
}

async function main() {
  const selector = process.env.IG_ANALYCA_USER_ID ?? process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
  const days = parseDaysArg();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[sync-full-history] target: kudooo_ai / past ${days} days / since ${sinceIso}`);

  const context = await getInstagramAccessContext(selector);
  console.log(`[sync-full-history] IG: ${context.instagramUsername} (${context.instagramUserId})`);

  const reels = await fetchAllReelsSince(context, sinceIso);
  console.log(`[sync-full-history] ${reels.length} reels found`);

  if (!reels.length) return;

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const storage = getInstagramStorageConfig();

  let processed = 0;
  let failed = 0;
  const batchSize = 5;

  for (let i = 0; i < reels.length; i += batchSize) {
    const batch = reels.slice(i, i + batchSize);
    const probes = await Promise.all(
      batch.map(async (reel) => {
        try {
          return await probeReelMetrics(context, reel);
        } catch (err) {
          console.warn(`[sync-full-history] probe failed for ${reel.id}:`, (err as Error).message);
          failed += 1;
          return null;
        }
      }),
    );

    const valid = probes.filter((p): p is NonNullable<typeof p> => p !== null);
    if (valid.length === 0) continue;

    const rows = buildSnapshotRows(context, valid);
    try {
      await insertReelMetricSnapshots(bigquery, storage.projectId, storage.dataset, storage.location, rows);
      processed += rows.length;
      console.log(`[sync-full-history] batch ${i / batchSize + 1}: inserted ${rows.length} (total ${processed}/${reels.length})`);
    } catch (err) {
      console.error(`[sync-full-history] insert failed:`, err);
      failed += rows.length;
    }
  }

  console.log(`[sync-full-history] Done. inserted=${processed} failed=${failed} total=${reels.length}`);
}

main().catch((err) => {
  console.error('[sync-full-history] Fatal:', err);
  process.exitCode = 1;
});
