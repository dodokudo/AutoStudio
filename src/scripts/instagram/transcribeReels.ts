import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { getInstagramAccessContext } from '@/lib/instagram/auth';
import { fetchRecentReels } from '@/lib/instagram/reelMetrics';
import { transcribeVideoFromUrl } from '@/lib/instagram/transcribe';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function getAlreadyTranscribed(bigquery: ReturnType<typeof createInstagramBigQuery>, dataset: string, projectId: string): Promise<Set<string>> {
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
  const context = await getInstagramAccessContext(selector);
  console.log('[transcribe-reels] Context:', {
    instagramUserId: context.instagramUserId,
    instagramUsername: context.instagramUsername,
  });

  const limit = Number(process.env.IG_TRANSCRIBE_LIMIT ?? '10');
  const reels = await fetchRecentReels(context, limit);
  console.log(`[transcribe-reels] Fetched ${reels.length} reels.`);

  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const storage = getInstagramStorageConfig();

  const already = await getAlreadyTranscribed(bigquery, storage.dataset, storage.projectId);
  const targets = reels.filter((reel) => !already.has(reel.id) && reel.media_url);
  console.log(`[transcribe-reels] ${targets.length} reels need transcription.`);

  for (const reel of targets) {
    if (!reel.media_url) continue;
    try {
      console.log(`[transcribe-reels] Processing ${reel.id}...`);
      const result = await transcribeVideoFromUrl(reel.media_url);
      const transcribedAt = new Date().toISOString();
      const createdAt = transcribedAt;
      await bigquery.dataset(storage.dataset).table('instagram_reel_transcripts').insert([
        {
          instagram_id: reel.id,
          user_id: context.autostudioUserId,
          transcribed_at: transcribedAt,
          model_name: result.modelName,
          duration_seconds: null,
          segments_json: JSON.stringify(result.segments),
          raw_text: result.rawText,
          created_at: createdAt,
        },
      ]);
      console.log(`[transcribe-reels] Saved transcript for ${reel.id}: ${result.segments.length} segments`);
    } catch (error) {
      console.warn(`[transcribe-reels] Failed for ${reel.id}:`, error);
    }
  }

  console.log('[transcribe-reels] Done.');
}

main().catch((error) => {
  console.error('[transcribe-reels] Failed:', error);
  process.exitCode = 1;
});
