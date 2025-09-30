import { NextResponse } from 'next/server';
import { updatePlanStatus, listPlans } from '@/lib/bigqueryPlans';
import { createJobForPlan } from '@/lib/bigqueryJobs';
import { processNextJob } from '@/lib/threadsWorker';

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

    console.log(`[threads/plans/approve] Plan approved, creating job and executing immediately...`);

    // ジョブを作成（scheduled_timeは現在時刻で即時実行）
    try {
      const job = await createJobForPlan({
        ...plan,
        scheduled_time: new Date().toTimeString().slice(0, 5), // HH:mm形式
      });

      if (!job) {
        throw new Error('Failed to create job');
      }

      console.log(`[threads/plans/approve] Job created: ${job.job_id}, executing...`);

      // 即座にジョブを実行
      const result = await processNextJob();

      if (result.status === 'succeeded') {
        console.log(`[threads/plans/approve] Successfully posted plan ${id}:`, result);

        return NextResponse.json({
          plan: { ...updated, status: 'scheduled' },
          published: true,
          job_result: result
        });
      } else if (result.status === 'failed') {
        console.error(`[threads/plans/approve] Failed to post plan ${id}:`, result.error);

        return NextResponse.json({
          plan: updated,
          published: false,
          publish_error: result.error
        });
      } else {
        // status === 'idle' (no job found)
        console.warn(`[threads/plans/approve] No job found to execute`);

        return NextResponse.json({
          plan: updated,
          published: false,
          publish_error: 'No job found to execute'
        });
      }
    } catch (publishError) {
      console.error(`[threads/plans/approve] Error creating job or executing:`, publishError);

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
