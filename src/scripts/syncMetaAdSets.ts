import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { fetchMetaAdSets, type MetaAdSet, type MetaCustomAudience } from '@/lib/ads/metaApi';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const DATASET = process.env.META_ADS_DATASET ?? 'autostudio_ads';
const TABLE = 'meta_adsets';
const LOCATION = process.env.META_ADS_LOCATION ?? 'asia-northeast1';

const ACCESS_TOKEN = process.env.META_ADS_ACCESS_TOKEN ?? '';
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? '';

function audienceTypeOf(adset: MetaAdSet): 'retargeting' | 'lookalike' | 'cold' | 'mixed' | 'unknown' {
  const targeting = adset.targeting;
  if (!targeting) return 'unknown';
  const customs = (targeting.custom_audiences ?? []) as MetaCustomAudience[];
  const hasCustom = customs.length > 0;
  const hasLookalikeName = customs.some((ca) => /lookalike|LAL/i.test(ca.name ?? ''));
  if (hasCustom && hasLookalikeName) return 'lookalike';
  if (hasCustom) return 'retargeting';
  if (targeting.interests || targeting.flexible_spec) return 'cold';
  return 'mixed';
}

async function ensureTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const dataset = client.dataset(DATASET);
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await dataset.create({ location: LOCATION });
  }
  const table = dataset.table(TABLE);
  const [exists] = await table.exists();
  if (exists) return;
  await table.create({
    schema: [
      { name: 'adset_id', type: 'STRING', mode: 'REQUIRED' },
      { name: 'adset_name', type: 'STRING' },
      { name: 'campaign_id', type: 'STRING' },
      { name: 'effective_status', type: 'STRING' },
      { name: 'audience_type', type: 'STRING', mode: 'REQUIRED' },
      { name: 'custom_audience_names', type: 'STRING', mode: 'REPEATED' },
      { name: 'excluded_audience_names', type: 'STRING', mode: 'REPEATED' },
      { name: 'targeting_json', type: 'STRING' },
      { name: 'synced_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    ],
    clustering: { fields: ['audience_type', 'adset_id'] },
  });
  console.log(`Created table ${DATASET}.${TABLE}`);
}

async function main() {
  if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    throw new Error('META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID env vars are required');
  }

  console.log('[sync-meta-adsets] Fetching adsets...');
  const adsets = await fetchMetaAdSets({ accessToken: ACCESS_TOKEN, adAccountId: AD_ACCOUNT_ID });
  console.log(`[sync-meta-adsets] Loaded ${adsets.length} adsets.`);

  await ensureTable();
  const client = createBigQueryClient(PROJECT_ID, LOCATION);
  const table = client.dataset(DATASET).table(TABLE);
  const syncedAt = new Date().toISOString();

  // streaming buffer 制約のため DELETE 不可。既存 adset_id をスキップして INSERT
  const [existingRows] = await client.query({
    query: `SELECT adset_id FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\``,
  });
  const existingIds = new Set((existingRows as Array<{ adset_id: string }>).map((r) => r.adset_id));

  const rows = adsets
    .filter((a) => !existingIds.has(a.id))
    .map((adset) => ({
      adset_id: adset.id,
      adset_name: adset.name ?? null,
      campaign_id: adset.campaign_id ?? null,
      effective_status: adset.effective_status ?? null,
      audience_type: audienceTypeOf(adset),
      custom_audience_names: (adset.targeting?.custom_audiences ?? []).map((c) => c.name ?? '').filter(Boolean),
      excluded_audience_names: (adset.targeting?.excluded_custom_audiences ?? []).map((c) => c.name ?? '').filter(Boolean),
      targeting_json: adset.targeting ? JSON.stringify(adset.targeting) : null,
      synced_at: syncedAt,
    }));

  console.log(`[sync-meta-adsets] Inserting ${rows.length} new adsets (${adsets.length - rows.length} already existed)...`);
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await table.insert(rows.slice(i, i + chunkSize));
  }

  // 集計を表示
  const byType = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.audience_type] = (acc[row.audience_type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('[sync-meta-adsets] audience_type breakdown:', byType);
  console.log('[sync-meta-adsets] Done.');
}

main().catch((error) => {
  console.error('[sync-meta-adsets] Failed:', error);
  if (error && typeof error === 'object' && 'errors' in error) {
    console.error('Insert errors:', JSON.stringify((error as { errors: unknown }).errors, null, 2).slice(0, 1500));
  }
  process.exitCode = 1;
});
