import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export async function GET() {
  try {
    console.log('[youtube/test-bq] Testing basic BigQuery connection...');

    const projectId = resolveProjectId();
    console.log('[youtube/test-bq] Project ID:', projectId);

    const client = createBigQueryClient(projectId);
    console.log('[youtube/test-bq] BigQuery client created');

    // Simple test query
    const [rows] = await client.query({
      query: 'SELECT 1 as test_value'
    });

    console.log('[youtube/test-bq] Test query successful, result:', rows);

    return NextResponse.json({
      success: true,
      message: 'BigQuery connection successful',
      projectId,
      testResult: rows[0]
    });

  } catch (error) {
    console.error('[youtube/test-bq] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}