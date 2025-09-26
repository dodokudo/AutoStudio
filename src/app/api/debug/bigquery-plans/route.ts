import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const PLAN_TABLE = 'thread_post_plans';

export async function GET() {
  try {
    const client = createBigQueryClient(PROJECT_ID);

    // Get all records to see what's actually in the table
    const allRecordsQuery = `
      SELECT
        plan_id,
        generation_date,
        scheduled_time,
        template_id,
        theme,
        status,
        main_text,
        comments,
        created_at,
        updated_at
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const [allRows] = await client.query({ query: allRecordsQuery });

    // Get today's records specifically
    const todayQuery = `
      SELECT
        plan_id,
        generation_date,
        SAFE_CAST(generation_date AS DATE) as generation_date_cast,
        CURRENT_DATE("Asia/Tokyo") as current_date,
        scheduled_time,
        template_id,
        theme,
        status,
        main_text,
        comments,
        created_at,
        updated_at
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      WHERE generation_date = CURRENT_DATE("Asia/Tokyo")
      ORDER BY created_at DESC
    `;

    const [todayRows] = await client.query({ query: todayQuery });

    // Get table schema
    const dataset = client.dataset(DATASET);
    const table = dataset.table(PLAN_TABLE);
    const [metadata] = await table.getMetadata();

    return NextResponse.json({
      allRecords: {
        count: allRows.length,
        records: allRows
      },
      todayRecords: {
        count: todayRows.length,
        records: todayRows
      },
      tableSchema: metadata.schema.fields.map((field: { name: string; type: string; mode: string }) => ({
        name: field.name,
        type: field.type,
        mode: field.mode
      })),
      debug: {
        projectId: PROJECT_ID,
        dataset: DATASET,
        table: PLAN_TABLE,
        currentDate: new Date().toISOString().slice(0, 10)
      }
    });
  } catch (error) {
    console.error('[debug/bigquery-plans] Error:', error);
    return NextResponse.json(
      {
        error: (error as Error).message,
        stack: (error as Error).stack
      },
      { status: 500 }
    );
  }
}