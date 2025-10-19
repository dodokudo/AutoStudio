import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { getAvailableTags } from '@/lib/lstep/tags';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

export async function GET() {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  try {
    const tags = await getAvailableTags(PROJECT_ID);

    return NextResponse.json({
      tags,
      count: tags.length,
    }, { status: 200 });
  } catch (error) {
    console.error('[api/line/tags] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch available tags' }, { status: 500 });
  }
}
