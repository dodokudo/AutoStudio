import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { replaceTodayPlans } from '@/lib/bigqueryPlans';
import { notifyGenerateFailure } from '@/lib/notifications';
import { resolveProjectId } from '@/lib/bigquery';
import type { PlanStatus, ThreadPlanSummary } from '@/types/threadPlan';

const PROJECT_ID = resolveProjectId();

type StreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'start'; total: number }
  | { type: 'progress'; stage: string; current: number; total: number; elapsedMs?: number }
  | { type: 'complete'; itemsCount: number }
  | { type: 'error'; message: string };

function createHeaders() {
  return {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  } satisfies Record<string, string>;
}

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = async (event: StreamEvent) => {
    try {
      const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
      await writer.write(encoder.encode(`${payload}\n`));
    } catch (error) {
      console.error('[threads/generate] Failed to send stream event', error);
    }
  };

  (async () => {
    const startTime = Date.now();
    try {
      await send({ type: 'stage', stage: 'initializing', message: 'プロンプトを準備しています…' });
      const payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });

      const total = Math.max(1, payload.meta.targetPostCount);
      await send({ type: 'start', total });
      await send({ type: 'stage', stage: 'generating', message: `Claudeで投稿を生成中… (${total}件)` });

      const generationStartedAt = Date.now();
      const claudeResult = await generateClaudePlans(payload, {
        async onProgress({ current, total: progressTotal }) {
          await send({
            type: 'progress',
            stage: 'generating',
            current,
            total: progressTotal,
            elapsedMs: Date.now() - generationStartedAt,
          });
        },
      });

      const fallbackSchedule = payload.meta.recommendedSchedule;
      const generatedPlans = claudeResult.posts.map((post, index) => {
        const planId = post.planId?.trim() || `gen-${index + 1}`;
        const scheduledTime = post.scheduledTime?.trim() || fallbackSchedule[index] || undefined;
        const templateId = post.templateId?.trim() || 'auto-generated';
        const theme = post.theme?.trim() || payload.writingChecklist.enforcedTheme;
        const status = ((post as { status?: PlanStatus }).status ?? 'draft') as PlanStatus;

        return {
          planId,
          scheduledTime,
          templateId,
          theme,
          mainText: post.mainPost,
          comments: (post.comments ?? []).map((text, commentIndex) => ({ order: commentIndex + 1, text })),
          status,
        };
      });

      if (!generatedPlans.length) {
        throw new Error('[threads/generate] Claude returned no posts');
      }

      await send({ type: 'stage', stage: 'persisting', message: 'BigQueryへ保存中…' });

      let summaries: ThreadPlanSummary[] = [];
      try {
        const persisted = await replaceTodayPlans(generatedPlans, fallbackSchedule);
        summaries = persisted.map((plan) => ({
          plan_id: plan.plan_id,
          generation_date: plan.generation_date,
          scheduled_time: plan.scheduled_time,
          status: plan.status,
          template_id: plan.template_id,
          theme: plan.theme,
          main_text: plan.main_text,
          comments: plan.comments,
          job_status: undefined,
          job_updated_at: undefined,
          job_error_message: undefined,
          log_status: undefined,
          log_error_message: undefined,
          log_posted_thread_id: undefined,
          log_posted_at: undefined,
        }));
      } catch (error) {
        console.error('[threads/generate] Failed to persist plans to BigQuery:', error);
        await send({
          type: 'stage',
          stage: 'fallback',
          message: 'BigQueryへの保存に失敗しました。生成結果をそのまま利用します。',
        });
      }

      if (!summaries.length) {
        const todayJst = new Date().toLocaleDateString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).replace(/\//g, '-');
        const fallbackSummaries = generatedPlans.map((plan, index) => ({
          plan_id: plan.planId,
          generation_date: todayJst,
          scheduled_time: plan.scheduledTime ?? fallbackSchedule[index] ?? '07:00',
          status: plan.status ?? 'draft',
          template_id: plan.templateId,
          theme: plan.theme,
          main_text: plan.mainText,
          comments: JSON.stringify(plan.comments ?? []),
          job_status: undefined,
          job_updated_at: undefined,
          job_error_message: undefined,
          log_status: undefined,
          log_error_message: undefined,
          log_posted_thread_id: undefined,
          log_posted_at: undefined,
        }));
        summaries = fallbackSummaries;
      }

      await send({ type: 'stage', stage: 'finalizing', message: 'レスポンスを整えています…' });
      await send({
        type: 'progress',
        stage: 'finalizing',
        current: total,
        total,
        elapsedMs: Date.now() - startTime,
      });

      await send({ type: 'complete', itemsCount: summaries.length });
    } catch (error) {
      console.error('[threads/generate] failed', error);
      const message = (error as Error).message ?? 'unknown error';
      await notifyGenerateFailure(message);
      await send({ type: 'error', message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    status: 200,
    headers: createHeaders(),
  });
}
