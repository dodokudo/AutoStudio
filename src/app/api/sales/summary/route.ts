import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';
const TABLE = 'charges';

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!isValidDate(start) || !isValidDate(end)) {
    return NextResponse.json({ error: 'start/end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  try {
    const client = createBigQueryClient(PROJECT_ID);
    const [rows] = await client.query({
      query: `
        SELECT
          SUM(CASE WHEN status = 'successful' THEN charged_amount ELSE 0 END) AS total_amount,
          COUNTIF(status = 'successful') AS successful_count,
          COUNTIF(status IN ('failed', 'error')) AS failed_count,
          COUNTIF(status IN ('pending', 'awaiting')) AS pending_count
        FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
        WHERE created_on >= TIMESTAMP(@start)
          AND created_on <= TIMESTAMP(@end)
          AND mode = 'live'
      `,
      params: { start, end },
    });

    const row = rows[0] as {
      total_amount?: number;
      successful_count?: number;
      failed_count?: number;
      pending_count?: number;
    };

    return NextResponse.json({
      success: true,
      data: {
        totalAmount: Number(row?.total_amount ?? 0),
        successfulCount: Number(row?.successful_count ?? 0),
        failedCount: Number(row?.failed_count ?? 0),
        pendingCount: Number(row?.pending_count ?? 0),
      },
    });
  } catch (error) {
    console.error('[api/sales/summary] Error:', error);
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 });
  }
}
