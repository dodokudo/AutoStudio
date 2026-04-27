import { NextRequest, NextResponse } from 'next/server';
import { deleteScheduledPost, getScheduledPostById, toJstIsoString, updateScheduledPost } from '@/lib/bigqueryScheduledPosts';
import { normalizeTokutenGuideComment } from '@/lib/threadsText';

function validateTextLength(label: string, value?: string) {
  if (!value) return null;
  if (value.length > 500) {
    return `${label}は500文字以内である必要があります`;
  }
  return null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheduleId = id;
    if (!scheduleId) {
      return NextResponse.json({ error: 'schedule id is required' }, { status: 400 });
    }

    const payload = await request.json();
    const { scheduledAt, mainText, comment1, comment2, comment3, comment4, comment5, comment6, comment7, comment8, status, planId } = payload ?? {};

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
      if (typeof value !== 'string') continue;
      if (value.length > 500) {
        return NextResponse.json({ error: `${label}は500文字以内である必要があります` }, { status: 400 });
      }
    }

    const scheduledTimeIso =
      typeof scheduledAt === 'string' ? toJstIsoString(scheduledAt) : undefined;
    if (typeof scheduledAt === 'string' && !scheduledTimeIso) {
      return NextResponse.json({ error: 'scheduledAt is invalid' }, { status: 400 });
    }

    const updated = await updateScheduledPost(scheduleId, {
      planId: typeof planId === 'string' ? planId : undefined,
      scheduledTimeIso,
      status: typeof status === 'string' ? status : undefined,
      mainText: typeof mainText === 'string' ? mainText : undefined,
      comment1: typeof comment1 === 'string' ? comment1 : undefined,
      comment2: typeof comment2 === 'string' ? comment2 : undefined,
      comment3: typeof comment3 === 'string' ? normalizeTokutenGuideComment(comment3) : undefined,
      comment4: typeof comment4 === 'string' ? comment4 : undefined,
      comment5: typeof comment5 === 'string' ? comment5 : undefined,
      comment6: typeof comment6 === 'string' ? comment6 : undefined,
      comment7: typeof comment7 === 'string' ? comment7 : undefined,
      comment8: typeof comment8 === 'string' ? comment8 : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[threads/schedule] PUT failed', error);
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scheduleId = id;
    if (!scheduleId) {
      return NextResponse.json({ error: 'schedule id is required' }, { status: 400 });
    }

    const existing = await getScheduledPostById(scheduleId);
    if (!existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    await deleteScheduledPost(scheduleId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[threads/schedule] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}
