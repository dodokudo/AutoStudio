import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';
import { getScriptLibraryData } from '@/lib/instagram/scriptLibrary';

export const revalidate = 1800;

const getCachedScriptLibraryData = unstable_cache(
  async () => getScriptLibraryData(),
  ['instagram-script-library'],
  { revalidate: 1800 },
);

export async function GET() {
  try {
    const data = await getCachedScriptLibraryData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/instagram/script-library]', err);
    return NextResponse.json({ error: 'Failed to load script library data' }, { status: 500 });
  }
}
