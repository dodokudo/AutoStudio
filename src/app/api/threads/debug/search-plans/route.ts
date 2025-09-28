import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const PLAN_TABLE = 'thread_post_plans';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchTerm = searchParams.get('q');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;

    const client: BigQuery = createBigQueryClient(PROJECT_ID);

    const whereConditions = [];
    const params: Record<string, unknown> = {};

    if (searchTerm) {
      whereConditions.push('(main_text LIKE @searchTerm OR plan_id LIKE @searchTerm)');
      params.searchTerm = `%${searchTerm}%`;
    }

    if (status) {
      whereConditions.push('status = @status');
      params.status = status;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const sql = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT @limit
    `;

    params.limit = limit;

    console.log('[debug/search-plans] Executing SQL:', sql);
    console.log('[debug/search-plans] Parameters:', params);

    const [rows] = await client.query({ query: sql, params });

    const plans = rows.map((row: Record<string, unknown>) => ({
      plan_id: String(row.plan_id || ''),
      generation_date: String(row.generation_date || ''),
      scheduled_time: String(row.scheduled_time || ''),
      status: String(row.status || ''),
      template_id: String(row.template_id || ''),
      theme: String(row.theme || ''),
      main_text: String(row.main_text || '').substring(0, 200) + '...',
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || '')
    }));

    return NextResponse.json({
      searchTerm,
      status,
      limit,
      planCount: plans.length,
      plans
    });
  } catch (error) {
    console.error('[debug/search-plans] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}