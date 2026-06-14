import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { insertScheduledPost, listScheduledPosts, toJstIsoString } from '@/lib/bigqueryScheduledPosts';
import { updateLatestPlanContent } from '@/lib/bigqueryPlans';
import { normalizeTokutenGuideComment } from '@/lib/threadsText';
import { resolveThreadsAccountKey } from '@/lib/threadsAccounts';

function validateTextLength(label: string, value?: string) {
  if (!value || value.trim().length === 0) {
    return `${label}は必須です`;
  }
  if (value.length > 500) {
    return `${label}は500文字以内である必要があります`;
  }
  return null;
}

function validateOptionalTextLength(label: string, value?: string) {
  if (!value) return null;
  if (value.length > 500) {
    return `${label}は500文字以内である必要があります`;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const accountKey = resolveThreadsAccountKey(searchParams.get('account'));

    const items = await listScheduledPosts({ startDate, endDate, accountKey });
    return NextResponse.json({ items });
  } catch (error) {
    console.error('[threads/schedule] GET failed', error);
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { scheduledAt, mainText, comment1, comment2, comment3, comment4, comment5, comment6, comment7, comment8, status, planId } = payload ?? {};
    const targetAccountKey = resolveThreadsAccountKey(payload?.targetAccountKey ?? payload?.accountKey);
    const sourceAccountKey = resolveThreadsAccountKey(payload?.sourceAccountKey ?? targetAccountKey);

    if (!scheduledAt || typeof scheduledAt !== 'string') {
      return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 });
    }

    const mainError = validateTextLength('メイン投稿', mainText);
    if (mainError) {
      return NextResponse.json({ error: mainError }, { status: 400 });
    }

    const comment1Error = validateTextLength('コメント1', comment1);
    if (comment1Error) {
      return NextResponse.json({ error: comment1Error }, { status: 400 });
    }

    const comment2Error = validateTextLength('コメント2', comment2);
    if (comment2Error) {
      return NextResponse.json({ error: comment2Error }, { status: 400 });
    }

    for (const [label, value] of [
      ['コメント3', comment3],
      ['コメント4', comment4],
      ['コメント5', comment5],
      ['コメント6', comment6],
      ['コメント7', comment7],
      ['コメント8', comment8],
    ] as const) {
      const err = validateOptionalTextLength(label, typeof value === 'string' ? value : undefined);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const scheduledTimeIso = toJstIsoString(String(scheduledAt));
    if (!scheduledTimeIso) {
      return NextResponse.json({ error: 'scheduledAt is invalid' }, { status: 400 });
    }
    const scheduleId = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = await insertScheduledPost({
      scheduleId,
      planId: typeof planId === 'string' ? planId : null,
      scheduledTimeIso,
      status: typeof status === 'string' ? status : 'scheduled',
      sourceAccountKey,
      targetAccountKey,
      mainText: String(mainText),
      comment1: String(comment1),
      comment2: String(comment2),
      comment3: normalizeTokutenGuideComment(typeof comment3 === 'string' ? comment3 : ''),
      comment4: typeof comment4 === 'string' ? comment4 : '',
      comment5: typeof comment5 === 'string' ? comment5 : '',
      comment6: typeof comment6 === 'string' ? comment6 : '',
      comment7: typeof comment7 === 'string' ? comment7 : '',
      comment8: typeof comment8 === 'string' ? comment8 : '',
    });

    if (!created) {
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }

    if (typeof planId === 'string' && planId) {
      try {
        const commentArr = [comment1, comment2, comment3, comment4, comment5, comment6, comment7, comment8]
          .map((text, idx) => ({ order: idx + 1, text: typeof text === 'string' ? text : '' }))
          .filter((c) => c.text);
        await updateLatestPlanContent(planId, {
          mainText: String(mainText),
          comments: JSON.stringify(commentArr),
          status: 'scheduled',
        });
      } catch (err) {
        console.error('[threads/schedule] failed to update plan content/status', err);
      }
    }

    revalidatePath('/threads');

    return NextResponse.json({ item: created });
  } catch (error) {
    console.error('[threads/schedule] POST failed', error);
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}
