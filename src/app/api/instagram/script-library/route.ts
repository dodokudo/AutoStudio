import { NextResponse } from 'next/server';
import { getScriptLibraryData } from '@/lib/instagram/scriptLibrary';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getScriptLibraryData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/instagram/script-library]', err);
    return NextResponse.json({ error: 'Failed to load script library data' }, { status: 500 });
  }
}
