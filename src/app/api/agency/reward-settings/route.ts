import { NextRequest, NextResponse } from 'next/server';

import { saveAgencyRewardSetting, type AgencyRewardMode } from '@/lib/agencyRewards';

export const dynamic = 'force-dynamic';

function isRewardMode(value: unknown): value is AgencyRewardMode {
  return value === 'performance' || value === 'list';
}

function moneyValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agency = typeof body.agency === 'string' ? body.agency.trim() : '';

    if (!agency) {
      return NextResponse.json({ success: false, error: 'agency is required' }, { status: 400 });
    }

    if (!isRewardMode(body.mode)) {
      return NextResponse.json({ success: false, error: 'mode must be performance or list' }, { status: 400 });
    }

    const saved = await saveAgencyRewardSetting({
      agency,
      mode: body.mode,
      listRewardUnit: moneyValue(body.listRewardUnit),
      performanceRewardUnit: moneyValue(body.performanceRewardUnit),
      revenueUnit: moneyValue(body.revenueUnit),
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('[api/agency/reward-settings] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save reward setting' },
      { status: 500 },
    );
  }
}
