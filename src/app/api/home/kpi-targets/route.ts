import { NextRequest, NextResponse } from 'next/server';
import {
  getKpiTarget,
  saveKpiTarget,
  getDefaultKpiTarget,
  type KpiTargetInput,
} from '@/lib/home/kpi-targets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/home/kpi-targets?month=YYYY-MM
 * 指定月のKPI目標を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month) {
      // 今月をデフォルト
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const target = await getKpiTarget(currentMonth);
      return NextResponse.json({
        success: true,
        data: target ?? getDefaultKpiTarget(currentMonth),
      });
    }

    // 月フォーマット検証
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: 'Invalid month format. Use YYYY-MM.' },
        { status: 400 }
      );
    }

    const target = await getKpiTarget(month);
    return NextResponse.json({
      success: true,
      data: target ?? getDefaultKpiTarget(month),
    });
  } catch (error) {
    console.error('GET /api/home/kpi-targets error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/home/kpi-targets
 * KPI目標を保存
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // バリデーション
    const required = [
      'targetMonth',
      'workingDays',
      'targetRevenue',
      'targetLineRegistrations',
      'targetSeminarParticipants',
      'targetFrontendPurchases',
      'targetBackendPurchases',
    ];

    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // 月フォーマット検証
    if (!/^\d{4}-\d{2}$/.test(body.targetMonth)) {
      return NextResponse.json(
        { success: false, error: 'Invalid targetMonth format. Use YYYY-MM.' },
        { status: 400 }
      );
    }

    const input: KpiTargetInput = {
      targetMonth: body.targetMonth,
      workingDays: Number(body.workingDays),
      targetRevenue: Number(body.targetRevenue),
      targetLineRegistrations: Number(body.targetLineRegistrations),
      targetSeminarParticipants: Number(body.targetSeminarParticipants),
      targetFrontendPurchases: Number(body.targetFrontendPurchases),
      targetBackendPurchases: Number(body.targetBackendPurchases),
    };

    // 数値バリデーション
    if (input.workingDays < 1 || input.workingDays > 31) {
      return NextResponse.json(
        { success: false, error: 'workingDays must be between 1 and 31' },
        { status: 400 }
      );
    }

    const saved = await saveKpiTarget(input);

    return NextResponse.json({
      success: true,
      data: saved,
    });
  } catch (error) {
    console.error('POST /api/home/kpi-targets error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
