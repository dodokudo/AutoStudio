import { NextRequest, NextResponse } from 'next/server';
import { getMonthlyPlan, saveMonthlyPlan } from '@/lib/home/monthly-plan';
import { isMonth, validateMonthlyPlan } from '@/lib/home/monthly-plan-types';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month');
  if (!isMonth(month)) return NextResponse.json({ error: '対象月を確認してください' }, { status: 400 });
  try {
    return NextResponse.json(await getMonthlyPlan(month));
  } catch (error) {
    console.error('[monthly-plan]', error instanceof Error ? error.message : 'read failed');
    return NextResponse.json({ error: '月間タスクの取得に失敗しました' }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  const plan = await request.json().catch(() => null);
  const invalid = validateMonthlyPlan(plan);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  try {
    return NextResponse.json(await saveMonthlyPlan(plan));
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存に失敗しました';
    console.error('[monthly-plan]', message);
    return NextResponse.json({ error: message }, { status: message.startsWith('別の画面') ? 409 : 500 });
  }
}
