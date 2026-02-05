import { NextRequest, NextResponse } from 'next/server';
import { getMonthlyActuals, getDailyActuals } from '@/lib/home/monthly-actuals';

export const revalidate = 300;

/**
 * GET /api/home/monthly-actuals?month=YYYY-MM
 * 月次実績データを取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let month = searchParams.get('month');
    const includeDaily = searchParams.get('daily') === 'true';

    // デフォルトは今月
    if (!month) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // 月フォーマット検証
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: 'Invalid month format. Use YYYY-MM.' },
        { status: 400 }
      );
    }

    const [actuals, dailyActuals] = await Promise.all([
      getMonthlyActuals(month),
      includeDaily ? getDailyActuals(month) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...actuals,
        daily: includeDaily ? dailyActuals : undefined,
      },
    });
  } catch (error) {
    console.error('GET /api/home/monthly-actuals error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
