import { NextResponse } from 'next/server';
import { updatePlanStatus } from '@/lib/bigqueryPlans';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log(`[threads/plans/approve] Approving plan: ${id}`);

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
