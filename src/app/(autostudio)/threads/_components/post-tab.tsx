'use client';

import { InsightsCard } from './insights-card';
import { InsightsRangeSelector } from './insights-range-selector';
import { IndividualPostCard } from './individual-post-card';
import { RegenerateButton } from './regenerate-button';
import { PostQueueContainer } from './post-queue-container';
import { PostedContent } from './posted-content';
import type { ThreadPlanSummary } from '@/types/threadPlan';
import { Card } from '@/components/ui/card';

type RangeOption = {
  label: string;
  value: string;
};

type TemplateOption = {
  value: string;
  label: string;
};

type PostTabProps = {
  stats: Array<{
    label: string;
    value: string;
    delta?: string;
    deltaTone?: 'up' | 'down' | 'neutral';
    deltaHighlight?: boolean;
  }>;
  noteText: string;
  rangeSelectorOptions: RangeOption[];
  selectedRangeValue: string;
  customStart?: string;
  customEnd?: string;
  planSummaries: ThreadPlanSummary[];
  templateOptions: TemplateOption[];
  recentLogs?: Array<Record<string, unknown>>;
};

export function PostTab({
  stats,
  noteText,
  rangeSelectorOptions,
  selectedRangeValue,
  customStart,
  customEnd,
  planSummaries,
  templateOptions,
  recentLogs,
}: PostTabProps) {
  return (
    <div className="section-stack">
      <InsightsCard
        title="アカウントの概要"
        stats={stats}
        note={noteText}
        actions={
          <InsightsRangeSelector
            options={rangeSelectorOptions}
            value={selectedRangeValue}
            customStart={customStart}
            customEnd={customEnd}
          />
        }
      />

      <IndividualPostCard />

      <Card>
        <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">今日の投稿案</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              生成済みの投稿案を確認して編集・承認に進めます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RegenerateButton />
          </div>
        </header>
        <PostQueueContainer
          initialPlans={JSON.parse(JSON.stringify(planSummaries))}
          templateOptions={templateOptions}
          variant="embedded"
        />
      </Card>

      <PostedContent initialLogs={recentLogs} />
    </div>
  );
}
