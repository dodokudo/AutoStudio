import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import { fetchAllReelsSince } from '@/lib/instagram/reelMetrics';
import { transcribeVideoFromUrl } from '@/lib/instagram/transcribe';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function getAlreadyTranscribed(
  bigquery: ReturnType<typeof createInstagramBigQuery>,
  dataset: string,
  projectId: string,
): Promise<Set<string>> {
  const query = `SELECT instagram_id FROM \`${projectId}.${dataset}.instagram_reel_transcripts\``;
  try {
    const [rows] = await bigquery.query({ query });
    return new Set(rows.map((row: { instagram_id: string }) => row.instagram_id));
  } catch {
    return new Set();
  }
}

async function main() {
  const selector = process.env.IG_ANALYCA_USER_ID ?? process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
  const days = Number(process.env.IG_HISTORY_DAYS ?? '365');
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const context = await getInstagramAccessContext(selector);
  console.log(`[transcribe-full] IG: ${context.instagramUsername} / since: ${sinceIso}`);

  const reels = await fetchAllReelsSince(context, sinceIso);
  console.log(`[transcribe-full] ${reels.length} reels fetched`);

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const storage = getInstagramStorageConfig();

  const already = await getAlreadyTranscribed(bigquery, storage.dataset, storage.projectId);
  const targets = reels.filter((reel) => !already.has(reel.id) && reel.media_url);
  console.log(`[transcribe-full] ${targets.length} reels need transcription (${already.size} already done)`);

  let ok = 0;
  let fail = 0;
  for (const reel of targets) {
    if (!reel.media_url) continue;
    const idx = targets.indexOf(reel) + 1;
    try {
      console.log(`[transcribe-full] (${idx}/${targets.length}) ${reel.id} (${reel.permalink})`);
      const result = await transcribeVideoFromUrl(reel.media_url);
      const transcribedAt = new Date().toISOString();
      await bigquery.dataset(storage.dataset).table('instagram_reel_transcripts').insert([
        {
          instagram_id: reel.id,
          user_id: context.autostudioUserId,
          transcribed_at: transcribedAt,
          model_name: result.modelName,
          duration_seconds: result.segments.length ? result.segments[result.segments.length - 1].end : null,
          segments_json: JSON.stringify(result.segments),
          raw_text: result.rawText,
          created_at: transcribedAt,
        },
      ]);
      ok += 1;
      console.log(`  OK: ${result.segments.length} segments`);
    } catch (err) {
      fail += 1;
      console.warn(`  FAIL: ${(err as Error).message}`);
    }
  }
  console.log(`[transcribe-full] Done. ok=${ok} fail=${fail} total=${targets.length}`);
}

main().catch((err) => {
  console.error('[transcribe-full] Fatal:', err);
  process.exitCode = 1;
});
