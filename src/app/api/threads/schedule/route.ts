import { NextRequest, NextResponse } from 'next/server';
import { insertScheduledPost, listScheduledPosts, toJstIsoString } from '@/lib/bigqueryScheduledPosts';

function validateTextLength(label: string, value?: string) {
  if (!value || value.trim().length === 0) {
    return `${label}は必須です`;
  }
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

    const items = await listScheduledPosts({ startDate, endDate });
    return NextResponse.json({ items });
  } catch (error) {
    console.error('[threads/schedule] GET failed', error);
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { scheduledAt, mainText, comment1, comment2, status, planId } = payload ?? {};

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
      mainText: String(mainText),
      comment1: String(comment1),
      comment2: String(comment2),
    });

    if (!created) {
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }

    return NextResponse.json({ item: created });
  } catch (error) {
    console.error('[threads/schedule] POST failed', error);
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}
