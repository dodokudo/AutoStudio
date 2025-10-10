'use client';

import { useState, useMemo } from 'react';
import type { LstepAnalyticsData } from '@/lib/lstep/analytics';
import { Card } from '@/components/ui/card';
import { DailyRegistrationsTable } from './DailyRegistrationsTable';

interface LineDashboardClientProps {
  initialData: LstepAnalyticsData;
}

type DateRangeFilter = '3days' | '7days' | '30days' | '90days' | 'all' | 'custom';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatDateForInput(value: string): string {
  return new Date(value).toISOString().split('T')[0];
}

export function LineDashboardClient({ initialData }: LineDashboardClientProps) {
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // 期間フィルターに応じてデータを集計
  const filteredAnalytics = useMemo(() => {
    let dailyDataInRange = initialData.dailyRegistrations;

    if (dateRange === 'custom' && customStartDate && customEndDate) {
      // カスタム日付範囲でフィルター
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);

      dailyDataInRange = initialData.dailyRegistrations.filter(day => {
        const dayDate = new Date(day.date);
        return dayDate >= start && dayDate <= end;
      });
    } else {
      // プリセット期間でフィルター
      const days = dateRange === '3days' ? 3 : dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : dateRange === '90days' ? 90 : null;

      if (!days) {
        return initialData;
      }

      // 日別登録数から期間分のデータを取得
      dailyDataInRange = initialData.dailyRegistrations.slice(0, days);
    }

    // ファネル分析の再計算
    const totalRegistrations = dailyDataInRange.reduce((sum, day) => sum + day.registrations, 0);
    const totalSurveyCompleted = dailyDataInRange.reduce((sum, day) => sum + day.surveyCompleted, 0);

    const funnel = {
      lineRegistration: totalRegistrations,
      surveyEntered: 0,
      surveyCompleted: totalSurveyCompleted,
      surveyEnteredCVR: 0,
      surveyCompletedCVR: totalRegistrations > 0 ? (totalSurveyCompleted / totalRegistrations) * 100 : 0,
    };

    // 流入経路と属性分析を期間に応じて概算（登録数の比率で按分）
    const registrationRatio = initialData.funnel.lineRegistration > 0
      ? totalRegistrations / initialData.funnel.lineRegistration
      : 0;

    const sources = {
      threads: Math.round(initialData.sources.threads * registrationRatio),
      threadsPercent: initialData.sources.threadsPercent,
      instagram: Math.round(initialData.sources.instagram * registrationRatio),
      instagramPercent: initialData.sources.instagramPercent,
      youtube: Math.round(initialData.sources.youtube * registrationRatio),
      youtubePercent: initialData.sources.youtubePercent,
      other: Math.round(initialData.sources.other * registrationRatio),
      otherPercent: initialData.sources.otherPercent,
      organic: Math.round(initialData.sources.organic * registrationRatio),
      organicPercent: initialData.sources.organicPercent,
    };

    const attributes = {
      age: initialData.attributes.age.map(item => ({
        ...item,
        count: Math.round(item.count * registrationRatio),
      })),
      job: initialData.attributes.job.map(item => ({
        ...item,
        count: Math.round(item.count * registrationRatio),
      })),
      currentRevenue: initialData.attributes.currentRevenue.map(item => ({
        ...item,
        count: Math.round(item.count * registrationRatio),
      })),
      goalRevenue: initialData.attributes.goalRevenue.map(item => ({
        ...item,
        count: Math.round(item.count * registrationRatio),
      })),
    };

    return {
      ...initialData,
      funnel,
      dailyRegistrations: dailyDataInRange,
      sources,
      attributes,
    };
  }, [initialData, dateRange, customStartDate, customEndDate]);

  return (
    <div className="section-stack">
      {/* ヘッダー */}
      <Card>
        <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE登録者分析</h1>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
          最終更新: {formatDateLabel(initialData.latestSnapshotDate!)}
        </p>
      </Card>

      {/* 期間フィルター */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[color:var(--color-text-secondary)] font-medium">表示期間:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setDateRange('3days')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === '3days'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                過去3日
              </button>
              <button
                onClick={() => setDateRange('7days')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === '7days'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                過去7日
              </button>
              <button
                onClick={() => setDateRange('30days')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === '30days'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                過去30日
              </button>
              <button
                onClick={() => setDateRange('90days')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === '90days'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                過去90日
              </button>
              <button
                onClick={() => setDateRange('all')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === 'all'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                全期間
              </button>
              <button
                onClick={() => setDateRange('custom')}
                className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
                  dateRange === 'custom'
                    ? 'bg-[color:var(--color-accent)] text-white font-medium'
                    : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
                }`}
              >
                日付指定
              </button>
            </div>
          </div>

          {/* カスタム日付選択 */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 pl-24">
              <label className="flex items-center gap-2">
                <span className="text-sm text-[color:var(--color-text-secondary)]">開始日:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  max={customEndDate || undefined}
                  className="px-3 py-1.5 text-sm border border-[color:var(--color-border)] rounded-[var(--radius-sm)] bg-[color:var(--color-surface)] text-[color:var(--color-text-primary)]"
                />
              </label>
              <span className="text-sm text-[color:var(--color-text-secondary)]">〜</span>
              <label className="flex items-center gap-2">
                <span className="text-sm text-[color:var(--color-text-secondary)]">終了日:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate || undefined}
                  className="px-3 py-1.5 text-sm border border-[color:var(--color-border)] rounded-[var(--radius-sm)] bg-[color:var(--color-surface)] text-[color:var(--color-text-primary)]"
                />
              </label>
            </div>
          )}
        </div>
      </Card>

      {/* 日別登録数テーブル */}
      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📅 日別登録数</h2>
        <DailyRegistrationsTable data={filteredAnalytics.dailyRegistrations} hideFilter />
      </Card>

      {/* ファネル分析 */}
      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📈 ファネル分析</h2>
        <div className="flex flex-col md:flex-row items-center justify-center gap-0">
          {/* LINE登録 */}
          <div className="flex-1 text-center max-w-[280px]">
            <div className="bg-[color:var(--color-surface)] border-2 border-[color:var(--color-accent)] rounded-[var(--radius-md)] p-8 shadow-[var(--shadow-soft)]">
              <div className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">LINE登録</div>
              <div className="text-4xl font-bold text-[color:var(--color-text-primary)]">
                {formatNumber(filteredAnalytics.funnel.lineRegistration)}人
              </div>
            </div>
          </div>

          {/* CVR矢印 */}
          <div className="flex flex-col items-center gap-1 px-4 py-2 md:py-0">
            <span className="text-2xl">→</span>
            <span
              className={`text-xs font-semibold ${
                filteredAnalytics.funnel.lineRegistration > 0 &&
                (filteredAnalytics.funnel.surveyCompleted / filteredAnalytics.funnel.lineRegistration) * 100 >= 50
                  ? 'text-[color:var(--color-success)]'
                  : 'text-[color:var(--color-warning)]'
              }`}
            >
              CVR: {formatPercent(
                filteredAnalytics.funnel.lineRegistration > 0
                  ? (filteredAnalytics.funnel.surveyCompleted / filteredAnalytics.funnel.lineRegistration) * 100
                  : 0
              )}
            </span>
          </div>

          {/* アンケート完了 */}
          <div className="flex-1 text-center max-w-[280px]">
            <div className="bg-[color:var(--color-surface)] border-2 border-[color:var(--color-accent)] rounded-[var(--radius-md)] p-8 shadow-[var(--shadow-soft)]">
              <div className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">アンケート完了</div>
              <div className="text-4xl font-bold text-[color:var(--color-text-primary)]">
                {formatNumber(filteredAnalytics.funnel.surveyCompleted)}人
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 流入経路分析 */}
      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📱 流入経路分析</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
            <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">Threads</h3>
            <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
              {formatNumber(filteredAnalytics.sources.threads)}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {formatPercent(filteredAnalytics.sources.threadsPercent)}
            </div>
          </div>

          <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
            <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">Instagram</h3>
            <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
              {formatNumber(filteredAnalytics.sources.instagram)}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {formatPercent(filteredAnalytics.sources.instagramPercent)}
            </div>
          </div>

          <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
            <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">YouTube</h3>
            <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
              {formatNumber(filteredAnalytics.sources.youtube)}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {formatPercent(filteredAnalytics.sources.youtubePercent)}
            </div>
          </div>

          <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
            <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">その他</h3>
            <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
              {formatNumber(filteredAnalytics.sources.other)}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {formatPercent(filteredAnalytics.sources.otherPercent)}
            </div>
          </div>

          <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
            <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">オーガニック</h3>
            <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
              {formatNumber(filteredAnalytics.sources.organic)}
            </div>
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {formatPercent(filteredAnalytics.sources.organicPercent)}
            </div>
          </div>
        </div>
      </Card>

      {/* 属性分析 */}
      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">👥 属性分析</h2>

        {/* 年齢層 */}
        <div className="mb-8">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">年齢層</h3>
          <div className="space-y-3">
            {filteredAnalytics.attributes.age.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                  {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 職業 */}
        <div className="mb-8">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">職業</h3>
          <div className="space-y-3">
            {filteredAnalytics.attributes.job.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                  {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 現在の売上 */}
        <div className="mb-8">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">現在の売上（月商）</h3>
          <div className="space-y-3">
            {filteredAnalytics.attributes.currentRevenue.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                  {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 目標売上 */}
        <div>
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">目標売上（月商）</h3>
          <div className="space-y-3">
            {filteredAnalytics.attributes.goalRevenue.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                  {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
