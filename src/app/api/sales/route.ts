import { NextRequest, NextResponse } from 'next/server';
import { listCharges, getSalesSummary } from '@/lib/univapay/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const mode = searchParams.get('mode') as 'live' | 'test' | null;

    // デフォルトは過去30日
    const endDate = to ?? new Date().toISOString();
    const startDate = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const summary = await getSalesSummary(startDate, endDate);

    // 日別の売上を集計
    const dailySales = aggregateDailySales(summary.charges);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalAmount: summary.totalAmount,
          successfulCount: summary.successfulCount,
          failedCount: summary.failedCount,
          pendingCount: summary.pendingCount,
        },
        dailySales,
        charges: summary.charges.map(charge => ({
          id: charge.id,
          amount: charge.charged_amount,
          currency: charge.charged_currency,
          status: charge.status,
          createdAt: charge.created_on,
          metadata: charge.metadata,
        })),
        dateRange: {
          from: startDate,
          to: endDate,
        },
      },
    });
  } catch (error) {
    console.error('Sales API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

interface DailySale {
  date: string;
  amount: number;
  count: number;
}

function aggregateDailySales(charges: Array<{ charged_amount: number; status: string; created_on: string }>): DailySale[] {
  const dailyMap = new Map<string, DailySale>();

  for (const charge of charges) {
    if (charge.status !== 'successful') continue;

    const date = charge.created_on.split('T')[0];
    const existing = dailyMap.get(date);

    if (existing) {
      existing.amount += charge.charged_amount;
      existing.count += 1;
    } else {
      dailyMap.set(date, {
        date,
        amount: charge.charged_amount,
        count: 1,
      });
    }
  }

  return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}
