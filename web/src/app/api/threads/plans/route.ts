import { NextRequest, NextResponse } from 'next/server';
import { getThreadsInsights } from '@/lib/threadsInsights';
import { buildScheduleSlots } from '@/lib/promptBuilder';

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';

export async function GET() {
  try {
    const insights = await getThreadsInsights(PROJECT_ID);
    const schedule = buildScheduleSlots(insights.meta.targetPostCount);

    const items = insights.topSelfPosts.slice(0, 5).map((post, index) => ({
      id: post.postId ?? `plan-${index + 1}`,
      scheduledTime: schedule[index] ?? '07:00',
      templateId: 'auto-generated',
      theme: insights.trendingTopics[index]?.themeTag ?? '未分類',
      status: index === 0 ? 'draft' : index === 1 ? 'approved' : 'scheduled',
      mainText: post.content?.slice(0, 280) ?? '',
      comments: [],
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('[threads/plans] failed', error);
    return NextResponse.json(
      { error: 'Failed to load plans' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  await request.json().catch(() => undefined);
  return NextResponse.json(
    {
      message: 'Updating a Threads plan is not implemented yet.',
      todo: [
        'Validate edited content and schedule time',
        'Persist changes in BigQuery / datastore',
        'Emit activity log for audit trail',
      ],
    },
    { status: 501 },
  );
}
