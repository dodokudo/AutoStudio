import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { saveSupplementalInsights, supplementalInsightsEnabled } from '@/lib/threadsSupplementalInsights';
import { SupplementalValidationError, validateSupplementalBatch } from '@/lib/threadsSupplementalMetrics';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.THREADS_INSIGHTS_INGEST_KEY;
  if (!supplementalInsightsEnabled() || !secret || secret.length < 32) {
    return Response.json({ error: 'Import is not configured' }, { status: 503 });
  }
  const supplied = request.headers.get('x-threads-insights-key') ?? '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!supplied || !timingSafeEqual(hash(supplied), hash(secret))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return Response.json({ error: 'Expected application/json' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length')) > MAX_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return Response.json({ error: 'Payload too large' }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    const batch = validateSupplementalBatch(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const result = await saveSupplementalInsights(batch);
    revalidatePath('/threads');
    return Response.json(result);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof SupplementalValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('[threads/insights/import] Import failed', (error as { code?: number }).code);
    return Response.json({ error: 'Import failed; retry the identical payload' }, { status: 500 });
  }
}
