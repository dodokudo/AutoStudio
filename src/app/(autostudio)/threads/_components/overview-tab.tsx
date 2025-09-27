import { InsightsCard } from "./insights-card";
import { CompetitorHighlights } from "./competitor-highlight";
import { PostQueueContainer } from "./post-queue-container";
import { TemplateSummary } from "./template-summary";
import { DashboardCards } from "./dashboard-cards";
import { RegenerateButton } from "./regenerate-button";
import { InsightsRangeSelector } from "./insights-range-selector";
import { TrendingTopics } from "./trending-topics";
import type { ThreadPlanSummary } from "@/types/threadPlan";
import type { ThreadsDashboardData } from "@/lib/threadsDashboard";

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
  templateSummaries: Array<{
    templateId: string;
    version: number;
    status: string;
    impressionAvg72h: number;
    likeAvg72h: number;
    structureNotes: string;
  }>;
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
      <section className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
          <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center justify-center xl:justify-start">
            <RegenerateButton />
          </div>
          <div className="grid w-full gap-4 sm:grid-cols-3 xl:flex-1 xl:grid-cols-3">
            {props.heroStats.map((stat) => (
              <div key={stat.label} className="rounded-3xl bg-white/85 p-4 text-center shadow-[0_18px_38px_rgba(110,132,206,0.18)] dark:bg-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                  {stat.value.toLocaleString()}
                </p>
                <p className={`mt-2 rounded-full px-2.5 py-1 text-[11px] font-medium ${stat.tone}`}>
                  {stat.caption}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <InsightsCard
        title="アカウント概況"
        stats={props.stats}
        note={props.noteText}
        actions={
          <InsightsRangeSelector
            options={props.rangeSelectorOptions}
            value={props.selectedRangeValue}
            customStart={props.customStart}
            customEnd={props.customEnd}
          />
        }
      />

      <div className="grid gap-10 lg:grid-cols-[1.85fr,1fr]">
        <div className="section-stack">
          <PostQueueContainer
            initialPlans={JSON.parse(JSON.stringify(props.planSummaries))}
            templateOptions={props.templateOptions}
          />
          <TrendingTopics items={props.trendingTopics} />
        </div>
        <CompetitorHighlights items={props.competitorHighlights} />
      </div>

      <TemplateSummary items={props.templateSummaries} />
      <DashboardCards jobCounts={props.dashboard.jobCounts} recentLogs={props.dashboard.recentLogs} />
      <div className="sticky bottom-10 mt-6 flex justify-end">
        <button type="button" className="button-primary pointer-events-auto gap-3">
          今日の投稿を確定
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px]">承認待ち {props.queueMetrics.draft}</span>
        </button>
      </div>
    </div>
  );
}