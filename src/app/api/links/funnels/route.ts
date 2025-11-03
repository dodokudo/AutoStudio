import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  listLinkFunnels,
  upsertLinkFunnel,
} from '@/lib/links/bigquery';
import type { LinkFunnelStepType } from '@/lib/links/types';

interface StepPayload {
  stepId?: string;
  order?: number;
  label: string;
  type: LinkFunnelStepType;
  shortLinkId?: string;
  lineSource?: string;
  lineTag?: string;
}

interface FunnelPayload {
  id?: string;
  name: string;
  description?: string;
  steps: StepPayload[];
}

function normalizeSteps(steps: StepPayload[]): StepPayload[] {
  return steps.map((step, index) => ({
    ...step,
    order: index,
    stepId: step.stepId ?? randomUUID(),
  }));
}

export async function GET() {
  try {
    const funnels = await listLinkFunnels();
    return NextResponse.json({ funnels });
  } catch (error) {
    console.error('[links/funnels] GET failed', error);
    return NextResponse.json({ error: 'Failed to fetch funnels' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FunnelPayload;

    if (!body?.name || !Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: 'Invalid funnel payload' }, { status: 400 });
    }

    const normalizedSteps = normalizeSteps(body.steps).map((step) => {
      if (step.type === 'short_link' && !step.shortLinkId) {
        throw new Error('short_link step requires shortLinkId');
      }
      return step;
    });

    if (!normalizedSteps.some((step) => step.type === 'short_link')) {
      return NextResponse.json({ error: 'At least one step must reference a short link' }, { status: 400 });
    }

    const funnelId = body.id ?? randomUUID();

    const saved = await upsertLinkFunnel({
      id: funnelId,
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
      steps: normalizedSteps.map((step) => ({
        stepId: step.stepId!,
        order: step.order ?? 0,
        label: step.label?.trim() || 'ステップ',
        type: step.type,
        shortLinkId: step.shortLinkId,
        lineSource: step.lineSource,
        lineTag: step.lineTag,
      })),
    });

    return NextResponse.json({ funnel: saved });
  } catch (error) {
    console.error('[links/funnels] POST failed', error);
    const message = error instanceof Error ? error.message : 'Failed to save funnel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
