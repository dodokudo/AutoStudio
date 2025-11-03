import { NextResponse } from 'next/server';
import { listLineSources } from '@/lib/lstep/sources';
import { getAvailableTags } from '@/lib/lstep/tags';
import { resolveProjectId } from '@/lib/bigquery';

function resolveLstepProjectId(): string | null {
  const candidate =
    process.env.LSTEP_BQ_PROJECT_ID
    ?? process.env.BQ_PROJECT_ID
    ?? process.env.NEXT_PUBLIC_GCP_PROJECT_ID
    ?? process.env.GCP_PROJECT_ID
    ?? process.env.GOOGLE_CLOUD_PROJECT;
  return candidate ? resolveProjectId(candidate) : null;
}

export async function GET() {
  const projectId = resolveLstepProjectId();
  if (!projectId) {
    return NextResponse.json({ error: 'LSTEP project is not configured' }, { status: 500 });
  }

  try {
    const [sources, tags] = await Promise.all([
      listLineSources(),
      getAvailableTags(projectId),
    ]);

    return NextResponse.json({
      lineSources: sources,
      lineTags: tags.map((tag) => ({
        name: tag.name,
        description: tag.description ?? null,
      })),
    });
  } catch (error) {
    console.error('[links/funnels/options] GET failed', error);
    return NextResponse.json({ error: 'Failed to load funnel options' }, { status: 500 });
  }
}
