import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import {
  buildStorySnapshotRows,
  fetchActiveStories,
  insertStorySnapshots,
  probeStoryMetrics,
} from '@/lib/instagram/storyMetrics';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

function isProbeOnly(): boolean {
  return process.argv.includes('probe') || process.env.IG_STORY_METRICS_PROBE_ONLY === 'true';
}

async function main() {
  const selector = process.env.IG_ANALYCA_USER_ID ?? process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
  const context = await getInstagramAccessContext(selector);

  console.log('[sync-story-metrics] Instagram context loaded:', {
    source: context.source,
    instagramUserId: context.instagramUserId,
    instagramUsername: context.instagramUsername,
    tokenExpiresAt: context.tokenExpiresAt,
  });

  const stories = await fetchActiveStories(context);
  console.log(`[sync-story-metrics] Fetched ${stories.length} active stories.`);

  if (!stories.length) {
    console.log('[sync-story-metrics] No active stories. Skipping.');
    return;
  }

  const probeResults = [];
  for (const story of stories) {
    const result = await probeStoryMetrics(context, story);
    probeResults.push(result);
    console.log('[sync-story-metrics] Probed story:', {
      instagramId: story.id,
      mediaType: story.media_type,
      supported: Object.keys(result.supportedMetrics).filter((key) => result.supportedMetrics[key] !== null),
      unsupported: result.unsupportedMetrics,
    });
  }

  if (isProbeOnly()) {
    console.log('[sync-story-metrics] Probe only mode. Skipping BigQuery insert.');
    return;
  }

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);

  const storage = getInstagramStorageConfig();
  const rows = await buildStorySnapshotRows(context, probeResults);
  await insertStorySnapshots(bigquery, storage.dataset, rows);

  console.log(`[sync-story-metrics] Inserted ${rows.length} story snapshots.`);
}

main().catch((error) => {
  console.error('[sync-story-metrics] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('[sync-story-metrics] Insert errors detail:', JSON.stringify((error as { errors: unknown }).errors, null, 2));
  }
  process.exitCode = 1;
});
