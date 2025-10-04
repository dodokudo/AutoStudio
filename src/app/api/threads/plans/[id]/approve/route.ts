import { NextResponse } from 'next/server';
import { updatePlanStatus, listPlans } from '@/lib/bigqueryPlans';

function validateTextLength(mainText?: string, comments?: { text: string }[]): string | null {
  if (mainText && mainText.length > 500) {
    return 'メイン投稿は500文字以内である必要があります';
  }

  if (comments && Array.isArray(comments)) {
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]?.text && comments[i].text.length > 500) {
        return `コメント${i + 1}は500文字以内である必要があります`;
      }
    }
  }

  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log(`[threads/plans/approve] Approving plan: ${id}`);

    // 承認前にプランを取得して文字数チェック
    const plans = await listPlans();
    const plan = plans.find(p => p.plan_id === id);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // 文字数バリデーション
    let comments: { text: string }[] = [];
    try {
      comments = JSON.parse(plan.comments || '[]');
    } catch (error) {
      console.warn(`Failed to parse comments for plan ${id}:`, error);
    }

    const validationError = validateTextLength(plan.main_text, comments);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const updated = await updatePlanStatus(id, 'approved');
    if (!updated) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    console.log(`[threads/plans/approve] Plan approved successfully`);

    // ジョブ作成は不要 - スケジュール時間に自動実行される
    // cronが scheduled_time になったら自動的に投稿する

    return NextResponse.json({
      plan: updated,
      message: 'Plan approved. Will be posted at scheduled time by cron job.'
    });
  } catch (error) {
    console.error('[threads/plans/approve] failed', error);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
