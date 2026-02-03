import { NextRequest, NextResponse } from 'next/server';
import { deleteScheduledPost, getScheduledPostById, toJstIsoString, updateScheduledPost } from '@/lib/bigqueryScheduledPosts';

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
    const { scheduledAt, mainText, comment1, comment2, status, planId } = payload ?? {};

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
