'use client';

import { InsightsCard } from './insights-card';
import { CompetitorHighlights } from './competitor-highlight';
import { PostQueueContainer } from './post-queue-container';
import { TemplateSummary } from './template-summary';
import { DashboardCards } from './dashboard-cards';
import { RegenerateButton } from './regenerate-button';
// import { InsightsRangeSelector } from './insights-range-selector';
import { TrendingTopics } from './trending-topics';
import { IndividualPostCard } from './individual-post-card';
import { PostedContent } from './posted-content';
import { DebugPanel } from './debug-panel';
import type { ThreadPlanSummary } from '@/types/threadPlan';
import type { ThreadsDashboardData } from '@/lib/threadsDashboard';
import type { PromptTemplateSummary } from '@/types/prompt';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface OverviewTabProps {
  heroStats: Array<{
    label: string;
    value: number;
    caption: string;
    tone: string;
  }>;
  stats: Array<{
    label: string;
    value: string;
    delta?: string;
    deltaTone?: 'up' | 'down' | 'neutral';
  }>;
  noteText: string;
  rangeSelectorOptions: Array<{
    label: string;
    value: string;
  }>;
  selectedRangeValue: string;
  customStart?: string;
  customEnd?: string;
  planSummaries: ThreadPlanSummary[];
  templateOptions: Array<{
    value: string;
    label: string;
  }>;
  trendingTopics: Array<{
    themeTag: string;
    avgFollowersDelta: number;
    avgViews: number;
    sampleAccounts: string[];
  }>;
  competitorHighlights: Array<{
    accountName: string;
    username?: string;
    impressions?: string;
    likes?: string;
    summary: string;
    categories: string[];
  }>;
  templateSummaries: PromptTemplateSummary[];
  dashboard: ThreadsDashboardData;
  queueMetrics: {
    draft: number;
    approved: number;
    scheduled: number;
    rejected: number;
  };
}

export function OverviewTab(props: OverviewTabProps) {
  return (
    <div className="section-stack">
      <InsightsCard title="アカウント概況" stats={props.stats} />

      <IndividualPostCard />

      <Card className="accent-gradient">
        <div className="flex flex-col gap-4 md:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">本日の投稿案</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              最新のスケジュールを確認し、必要に応じて再生成してください。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <RegenerateButton />
              <Button variant="secondary" onClick={() => window?.scrollTo({ top: 0, behavior: 'smooth' })}>
                ページ更新
              </Button>
            </div>
          </div>
          <div className="grid w-full gap-3 grid-cols-1 sm:grid-cols-3 lg:w-auto lg:gap-4">
            {props.heroStats.map((stat) => (
              <div key={stat.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 md:p-5">
                <p className="text-xs font-medium text-[color:var(--color-text-secondary)] uppercase tracking-[0.08em]">
                  {stat.label}
                </p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{stat.value}</p>
                <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">{stat.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <PostQueueContainer
        initialPlans={JSON.parse(JSON.stringify(props.planSummaries))}
        templateOptions={props.templateOptions}
      />

      <PostedContent initialPostedPlans={props.planSummaries.filter(plan => plan.status === 'posted')} />

      <CompetitorHighlights items={props.competitorHighlights} />

      <TrendingTopics items={props.trendingTopics} />
      <DebugPanel />
      <TemplateSummary items={props.templateSummaries} />
      <DashboardCards jobCounts={props.dashboard.jobCounts} recentLogs={props.dashboard.recentLogs} />
      <div className="flex justify-end">
        <Button onClick={() => alert('投稿確定機能は未実装です')}>
          今日の投稿を確定
          <span className="ml-2 rounded-full bg-[color:var(--color-surface-muted)] px-2 py-1 text-[11px] font-medium text-[color:var(--color-text-secondary)]">
            承認待ち {props.queueMetrics.draft}
          </span>
        </Button>
      </div>
    </div>
  );
}
