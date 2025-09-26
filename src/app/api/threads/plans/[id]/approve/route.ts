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

    console.log(`[threads/plans/approve] Plan approved, triggering immediate publish...`);

    // Trigger immediate publishing
    try {
      const publishUrl = new URL('/api/threads/publish', request.url);
      const publishResponse = await fetch(publishUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: id }),
      });

      if (publishResponse.ok) {
        const publishResult = await publishResponse.json();
        console.log(`[threads/plans/approve] Successfully published plan ${id}:`, publishResult);

        // Update plan status to scheduled since it's now published
        await updatePlanStatus(id, 'scheduled');

        return NextResponse.json({
          plan: { ...updated, status: 'scheduled' },
          published: true,
          publish_result: publishResult
        });
      } else {
        const publishError = await publishResponse.text();
        console.error(`[threads/plans/approve] Failed to publish plan ${id}:`, publishError);

        return NextResponse.json({
          plan: updated,
          published: false,
          publish_error: publishError
        });
      }
    } catch (publishError) {
      console.error(`[threads/plans/approve] Error calling publish endpoint:`, publishError);

      return NextResponse.json({
        plan: updated,
        published: false,
        publish_error: (publishError as Error).message
      });
    }
  } catch (error) {
    console.error('[threads/plans/approve] failed', error);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
