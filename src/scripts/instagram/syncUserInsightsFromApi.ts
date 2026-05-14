import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import { fetchUserInsightsSnapshot, insertUserInsightsSnapshot } from '@/lib/instagram/userInsights';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

function isProbeOnly(): boolean {
  return process.argv.includes('probe') || process.env.IG_USER_INSIGHTS_PROBE_ONLY === 'true';
}

async function main() {
  const selector = process.env.IG_ANALYCA_USER_ID ?? process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
  const context = await getInstagramAccessContext(selector);
  console.log('[sync-user-insights] Instagram context loaded:', {
    source: context.source,
    instagramUserId: context.instagramUserId,
    instagramUsername: context.instagramUsername,
    tokenExpiresAt: context.tokenExpiresAt,
  });

  const row = await fetchUserInsightsSnapshot(context);
  console.log('[sync-user-insights] Snapshot:', {
    followers: row.followers_count,
    follows: row.follows_count,
    media: row.media_count,
    reach: row.reach,
    views: row.views,
    interactions: row.total_interactions,
    engaged: row.accounts_engaged,
    profile_taps: row.profile_links_taps,
  });

  if (isProbeOnly()) {
    console.log('[sync-user-insights] Probe only mode. Skipping BigQuery insert.');
    return;
  }

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const storage = getInstagramStorageConfig();
  await insertUserInsightsSnapshot(bigquery, storage.dataset, row);
  console.log('[sync-user-insights] Inserted 1 user insight snapshot.');
}

main().catch((error) => {
  console.error('[sync-user-insights] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('[sync-user-insights] Insert errors detail:', JSON.stringify((error as { errors: unknown }).errors, null, 2));
  }
  process.exitCode = 1;
});
