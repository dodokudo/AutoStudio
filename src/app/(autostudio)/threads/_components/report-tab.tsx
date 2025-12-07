'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';
import Chart from 'chart.js/auto';

interface TopPost {
  postId: string;
  content: string;
  impressions: number;
  likes: number;
  likeRate: number;
  postedAt: string;
  dayOfWeek: string;
  timeSlot: string;
  hour: number;
  hook: string;
  charCount: number;
  lineCount: number;
  usesKakko: boolean;
  usesQuote: boolean;
}

interface TimeSlotPerformance {
  slot: string;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface ActionPlan {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AvoidItem {
  title: string;
  reason: string;
}

interface WeeklyPlanItem {
  timeSlot: string;
  postsPerDay: number;
  focus: string;
}

interface DailyMetric {
  date: string;
  followers: number;
  followersDelta: number;
  impressions: number;
  likes: number;
  postsCount: number;
  winnerCount: number;
  lineRegistrations: number;
}

interface HourlyPerformance {
  hour: number;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface DayOfWeekPerformance {
  dayOfWeek: number;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface Insights {
  keyInsights: string[];
  bestTimeSlot: { label: string; avgImpressions: number; winRate: number };
  bestDayOfWeek: { label: string; avgImpressions: number; winRate: number };
  topPostInsight: string;
  recommendations: string[];
  teachingPoints?: string[];
  actionPlans?: ActionPlan[];
  avoidItems?: AvoidItem[];
  weeklyPlan?: WeeklyPlanItem[];
}

interface SavedReport {
  reportId: string;
  reportType: 'monthly';
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    label: string;
  };
  summary: {
    totalPosts: number;
    totalImpressions: number;
    totalLikes: number;
    avgImpressions: number;
    avgLikeRate: number;
    winnerCount: number;
    winRate: number;
    followerStart: number;
    followerEnd: number;
    followerChange: number;
    lineRegistrations: number;
    dailyAvgPosts: number;
  };
  dailyMetrics: DailyMetric[];
  topPosts: TopPost[];
  hourlyPerformance: HourlyPerformance[];
  dayOfWeekPerformance: DayOfWeekPerformance[];
  timeSlotPerformance?: TimeSlotPerformance[];
  insights?: Insights;
  generatedAt: string;
}

interface ReportListItem {
  reportId: string;
  reportType: string;
  periodYear: number;
  periodMonth: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

function formatNumber(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString();
}

function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// 日別チャートコンポーネント（複合グラフ: インプレッションは折れ線、フォロワー増加・LINE登録は棒グラフ）
function DailyChart({ dailyMetrics }: { dailyMetrics: DailyMetric[] }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || dailyMetrics.length === 0) return;

    // 既存のチャートを破棄
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const labels = dailyMetrics.map(d => {
      const date = new Date(d.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'インプレッション',
            data: dailyMetrics.map(d => d.impressions),
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            yAxisID: 'y',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
          },
          {
            type: 'bar',
            label: 'フォロワー増加',
            data: dailyMetrics.map(d => d.followersDelta || 0),
            backgroundColor: 'rgba(118, 75, 162, 0.7)',
            yAxisID: 'y1',
          },
          {
            type: 'bar',
            label: 'LINE登録（Threads経由）',
            data: dailyMetrics.map(d => d.lineRegistrations || 0),
            backgroundColor: 'rgba(255, 193, 7, 0.8)',
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'インプレッション',
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            title: {
              display: true,
              text: 'フォロワー増加 / LINE登録',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [dailyMetrics]);

  return (
    <div style={{ height: '400px' }}>
      <canvas ref={chartRef} />
    </div>
  );
}

// 時間帯別チャートコンポーネント
function HourlyChart({ hourlyPerformance }: { hourlyPerformance: HourlyPerformance[] }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || hourlyPerformance.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // 時間順にソート
    const sorted = [...hourlyPerformance].sort((a, b) => a.hour - b.hour);

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(h => h.label),
        datasets: [
          {
            label: '平均インプレッション',
            data: sorted.map(h => h.avgImpressions),
            backgroundColor: 'rgba(102, 126, 234, 0.7)',
            borderColor: '#667eea',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '平均インプレッション',
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [hourlyPerformance]);

  return (
    <div style={{ height: '300px' }}>
      <canvas ref={chartRef} />
    </div>
  );
}

// 曜日別チャートコンポーネント
function DayOfWeekChart({ dayOfWeekPerformance }: { dayOfWeekPerformance: DayOfWeekPerformance[] }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || dayOfWeekPerformance.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // 曜日順にソート（日曜=0から土曜=6）
    const sorted = [...dayOfWeekPerformance].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(d => `${d.label}曜日`),
        datasets: [
          {
            label: '平均インプレッション',
            data: sorted.map(d => d.avgImpressions),
            backgroundColor: 'rgba(118, 75, 162, 0.7)',
            borderColor: '#764ba2',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '平均インプレッション',
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [dayOfWeekPerformance]);

  return (
    <div style={{ height: '300px' }}>
      <canvas ref={chartRef} />
    </div>
  );
}

function SavedReportView({ report }: { report: SavedReport }) {
  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-8 text-center text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Threads運用レポート</h1>
        <p className="text-lg opacity-90">{report.period.label}</p>
        <p className="text-sm opacity-80 mt-2">
          分析期間：{report.period.startDate} 〜 {report.period.endDate}
        </p>
      </div>

      {/* サマリー */}
      <section className="bg-white rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
          📊 全体サマリー
        </h2>

        {/* 最重要インサイト */}
        {report.insights && report.insights.keyInsights.length > 0 && (
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-5 mb-6">
            <h3 className="text-lg font-bold text-green-800 mb-3">✅ 最重要インサイト</h3>
            <ul className="space-y-2">
              {report.insights.keyInsights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2 text-green-700">
                  <span className="text-green-500 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
              {report.insights.topPostInsight && (
                <li className="flex items-start gap-2 text-green-700 font-medium">
                  <span className="text-green-500 mt-1">•</span>
                  <span>{report.insights.topPostInsight}</span>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5 text-center shadow-md">
            <div className="text-xs uppercase tracking-wide opacity-90 mb-2">総投稿数</div>
            <div className="text-3xl font-bold">{report.summary.totalPosts}件</div>
            <div className="text-xs opacity-80 mt-1">1日平均 {report.summary.dailyAvgPosts.toFixed(1)}件</div>
          </div>
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5 text-center shadow-md">
            <div className="text-xs uppercase tracking-wide opacity-90 mb-2">総インプレッション</div>
            <div className="text-3xl font-bold">{formatNumber(report.summary.totalImpressions)}</div>
            <div className="text-xs opacity-80 mt-1">平均 {formatNumber(report.summary.avgImpressions)} imp/投稿</div>
          </div>
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5 text-center shadow-md">
            <div className="text-xs uppercase tracking-wide opacity-90 mb-2">勝ち投稿（10,000+）</div>
            <div className="text-3xl font-bold">{report.summary.winnerCount}件</div>
            <div className="text-xs opacity-80 mt-1">勝率 {formatPercent(report.summary.winRate)}</div>
          </div>
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5 text-center shadow-md">
            <div className="text-xs uppercase tracking-wide opacity-90 mb-2">フォロワー増加</div>
            <div className="text-3xl font-bold">+{formatNumber(report.summary.followerChange)}</div>
            <div className="text-xs opacity-80 mt-1">{report.summary.followerStart.toLocaleString()} → {report.summary.followerEnd.toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5 text-center shadow-md">
            <div className="text-xs uppercase tracking-wide opacity-90 mb-2">LINE登録（Threads経由）</div>
            <div className="text-3xl font-bold">{report.summary.lineRegistrations}件</div>
            <div className="text-xs opacity-80 mt-1">CVR {report.summary.totalImpressions > 0 ? formatPercent((report.summary.lineRegistrations / report.summary.totalImpressions) * 100, 3) : '0%'}</div>
          </div>
        </div>
      </section>

      {/* 日別推移グラフ */}
      <section className="bg-white rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
          📈 日別推移（インプレッション・フォロワー・LINE登録）
        </h2>
        <DailyChart dailyMetrics={report.dailyMetrics} />
      </section>

      {/* 教材化のポイント */}
      {report.insights?.teachingPoints && report.insights.teachingPoints.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            💡 教材化のポイント
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-5">
            <p className="text-blue-800 mb-3">上位投稿を分析すると、<strong>再現可能な成功パターン</strong>が見えてきます：</p>
            <ul className="space-y-2">
              {report.insights.teachingPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-blue-700">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* インプレッション上位TOP10 */}
      {report.topPosts.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            🏆 インプレッション上位TOP{report.topPosts.length}の詳細分析
          </h2>
          <div className="space-y-6">
            {report.topPosts.map((post, index) => (
              <div key={post.postId} className="border-l-4 border-[#667eea] bg-gray-50 rounded-lg p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-bold">
                      {index + 1}
                    </span>
                    <span className="text-sm text-gray-600">
                      {post.postedAt} ({post.dayOfWeek})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {post.impressions >= 10000 && (
                      <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full font-bold">勝ち投稿</span>
                    )}
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{post.timeSlot}</span>
                    <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full">{post.charCount}字</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mb-3 text-sm">
                  <span className="font-semibold text-[#667eea]">{formatNumber(post.impressions)} imp</span>
                  <span className="text-gray-600">{post.likes} likes</span>
                  <span className="text-gray-600">いいね率 {formatPercent(post.likeRate)}</span>
                </div>
                <div className="bg-white p-4 rounded border border-gray-200">
                  <div className="font-bold text-[#667eea] mb-2">フック（書き出し）：</div>
                  <div className="text-gray-800 font-medium mb-4 bg-gray-50 p-3 rounded">
                    {post.hook || post.content.split('\n')[0]}
                  </div>
                  <div className="font-bold text-[#667eea] mb-2">投稿内容（全文）：</div>
                  <div className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed max-h-64 overflow-y-auto bg-gray-50 p-3 rounded">
                    {post.content}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="text-gray-500">構造分析：</span>
                    {post.usesKakko && <span className="bg-green-100 text-green-700 px-2 py-1 rounded">【】使用 ✓</span>}
                    {post.usesQuote && <span className="bg-green-100 text-green-700 px-2 py-1 rounded">「」使用 ✓</span>}
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">行数: {post.lineCount}行</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 時間帯別パフォーマンス */}
      <section className="bg-white rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
          ⏰ 時間帯別パフォーマンス
        </h2>
        <HourlyChart hourlyPerformance={report.hourlyPerformance} />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-[#667eea]">
                <th className="p-3 font-bold">時間帯</th>
                <th className="p-3 text-right font-bold">投稿数</th>
                <th className="p-3 text-right font-bold">平均imp</th>
                <th className="p-3 text-right font-bold">勝ち投稿</th>
                <th className="p-3 text-right font-bold">勝率</th>
              </tr>
            </thead>
            <tbody>
              {[...report.hourlyPerformance]
                .sort((a, b) => b.avgImpressions - a.avgImpressions)
                .map((hour) => (
                  <tr key={hour.hour} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-3 font-medium">{hour.label}</td>
                    <td className="p-3 text-right">{hour.postsCount}件</td>
                    <td className="p-3 text-right">{formatNumber(hour.avgImpressions)}</td>
                    <td className="p-3 text-right">{hour.winnerCount}件</td>
                    <td className="p-3 text-right">{formatPercent(hour.winRate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 曜日別パフォーマンス */}
      <section className="bg-white rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
          📅 曜日別パフォーマンス
        </h2>
        <DayOfWeekChart dayOfWeekPerformance={report.dayOfWeekPerformance} />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-[#667eea]">
                <th className="p-3 font-bold">曜日</th>
                <th className="p-3 text-right font-bold">投稿数</th>
                <th className="p-3 text-right font-bold">平均imp</th>
                <th className="p-3 text-right font-bold">勝ち投稿</th>
                <th className="p-3 text-right font-bold">勝率</th>
              </tr>
            </thead>
            <tbody>
              {[...report.dayOfWeekPerformance]
                .sort((a, b) => b.avgImpressions - a.avgImpressions)
                .map((day) => (
                  <tr key={day.dayOfWeek} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-3 font-medium">{day.label}曜日</td>
                    <td className="p-3 text-right">{day.postsCount}件</td>
                    <td className="p-3 text-right">{formatNumber(day.avgImpressions)}</td>
                    <td className="p-3 text-right">{day.winnerCount}件</td>
                    <td className="p-3 text-right">{formatPercent(day.winRate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 時間帯スロット別パフォーマンス */}
      {report.timeSlotPerformance && report.timeSlotPerformance.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            🕐 時間帯スロット別パフォーマンス
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-[#667eea]">
                  <th className="p-3 font-bold">時間帯</th>
                  <th className="p-3 text-right font-bold">投稿数</th>
                  <th className="p-3 text-right font-bold">平均imp</th>
                  <th className="p-3 text-right font-bold">勝ち投稿</th>
                  <th className="p-3 text-right font-bold">勝率</th>
                </tr>
              </thead>
              <tbody>
                {[...report.timeSlotPerformance]
                  .sort((a, b) => b.avgImpressions - a.avgImpressions)
                  .map((slot, index) => (
                    <tr
                      key={slot.slot}
                      className={classNames(
                        "border-b border-gray-200",
                        index === 0 ? "bg-green-50" : "hover:bg-gray-50"
                      )}
                    >
                      <td className="p-3 font-medium">
                        {index === 0 && <span className="text-green-600 mr-2">★</span>}
                        {slot.label}
                      </td>
                      <td className="p-3 text-right">{slot.postsCount}件</td>
                      <td className="p-3 text-right font-semibold">{formatNumber(slot.avgImpressions)}</td>
                      <td className="p-3 text-right">{slot.winnerCount}件</td>
                      <td className="p-3 text-right">{formatPercent(slot.winRate)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 今すぐ実行するアクションプラン */}
      {report.insights?.actionPlans && report.insights.actionPlans.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            🎯 今すぐ実行するアクション
          </h2>
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-5">
            <ol className="space-y-4">
              {report.insights.actionPlans.map((action, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className={classNames(
                    "flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-bold",
                    action.priority === 'high' ? 'bg-red-500' : action.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                  )}>
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-bold text-green-800">{action.title}</div>
                    <div className="text-green-700 text-sm mt-1">{action.description}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* 避けるべきこと */}
      {report.insights?.avoidItems && report.insights.avoidItems.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            ⛔ 絶対に避けるべきこと
          </h2>
          <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-5">
            <ul className="space-y-3">
              {report.insights.avoidItems.map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-yellow-800">
                  <span className="text-yellow-600 mt-1">✗</span>
                  <div>
                    <span className="font-bold">{item.title}</span>
                    <span className="text-yellow-700"> → {item.reason}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 週間投稿計画 */}
      {report.insights?.weeklyPlan && report.insights.weeklyPlan.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            📅 週間投稿計画（推奨パターン）
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-5">
            <p className="text-blue-800 font-bold mb-4">
              1日平均 {Math.round(report.summary.dailyAvgPosts)}件 → ゴールデンタイムに集中
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-100 text-left text-blue-800">
                    <th className="p-3 font-bold">時間帯</th>
                    <th className="p-3 text-center font-bold">投稿数/日</th>
                    <th className="p-3 font-bold">フォーカス</th>
                  </tr>
                </thead>
                <tbody>
                  {report.insights.weeklyPlan.map((plan, index) => (
                    <tr
                      key={index}
                      className={classNames(
                        "border-b border-blue-200",
                        index === 0 ? "bg-green-100" : index === 1 ? "bg-green-50" : ""
                      )}
                    >
                      <td className="p-3 font-medium">{plan.timeSlot}</td>
                      <td className="p-3 text-center font-bold">{plan.postsPerDay}件</td>
                      <td className="p-3">{plan.focus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 運用アドバイス */}
      {report.insights && report.insights.recommendations.length > 0 && (
        <section className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-2xl font-bold text-[#667eea] mb-6 border-l-4 border-[#667eea] pl-4">
            💡 運用アドバイス
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-5">
            <ul className="space-y-3">
              {report.insights.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-3 text-blue-800">
                  <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ベスト投稿条件 */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-xl p-5">
              <h4 className="text-sm uppercase tracking-wide opacity-90 mb-2">🕐 ベスト投稿時間</h4>
              <div className="text-2xl font-bold">{report.insights.bestTimeSlot.label}</div>
              <div className="text-sm opacity-80 mt-1">
                平均 {report.insights.bestTimeSlot.avgImpressions.toLocaleString()} imp / 勝率 {formatPercent(report.insights.bestTimeSlot.winRate)}
              </div>
            </div>
            <div className="bg-gradient-to-r from-[#764ba2] to-[#667eea] text-white rounded-xl p-5">
              <h4 className="text-sm uppercase tracking-wide opacity-90 mb-2">📅 ベスト投稿曜日</h4>
              <div className="text-2xl font-bold">{report.insights.bestDayOfWeek.label}</div>
              <div className="text-sm opacity-80 mt-1">
                平均 {report.insights.bestDayOfWeek.avgImpressions.toLocaleString()} imp / 勝率 {formatPercent(report.insights.bestDayOfWeek.winRate)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* フッター */}
      <div className="text-center text-sm text-gray-500 pb-8">
        <p>レポート生成日時: {new Date(report.generatedAt).toLocaleString('ja-JP')}</p>
      </div>
    </div>
  );
}

export function ReportTab() {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateYear, setGenerateYear] = useState(2025);
  const [generateMonth, setGenerateMonth] = useState(11);

  const { data: listData, error: listError, isLoading: listLoading } = useSWR<{ reports: ReportListItem[] }>(
    '/api/threads/report/list',
    fetcher
  );

  const { data: reportData, error: reportError, isLoading: reportLoading } = useSWR<{ report: SavedReport }>(
    selectedReportId ? `/api/threads/report/${selectedReportId}` : null,
    fetcher
  );

  // 最初のレポートを自動選択
  useEffect(() => {
    if (listData?.reports && listData.reports.length > 0 && !selectedReportId) {
      setSelectedReportId(listData.reports[0].reportId);
    }
  }, [listData, selectedReportId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/threads/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: generateYear, month: generateMonth, type: 'monthly' }),
      });
      const data = await res.json();
      if (data.success) {
        mutate('/api/threads/report/list');
        setSelectedReportId(data.reportId);
      } else {
        alert(`生成に失敗しました: ${data.error}`);
      }
    } catch (error) {
      alert(`エラー: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setGenerating(false);
    }
  };

  const months = [
    { value: 1, label: '1月' }, { value: 2, label: '2月' }, { value: 3, label: '3月' },
    { value: 4, label: '4月' }, { value: 5, label: '5月' }, { value: 6, label: '6月' },
    { value: 7, label: '7月' }, { value: 8, label: '8月' }, { value: 9, label: '9月' },
    { value: 10, label: '10月' }, { value: 11, label: '11月' }, { value: 12, label: '12月' },
  ];

  return (
    <div className="space-y-6">
      {/* コントロールパネル */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">運用レポート</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              月次パフォーマンスレポートを生成・閲覧できます
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={generateYear}
              onChange={(e) => setGenerateYear(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={2024}>2024年</option>
              <option value={2025}>2025年</option>
            </select>
            <select
              value={generateMonth}
              onChange={(e) => setGenerateMonth(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className={classNames(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                generating
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90'
              )}
            >
              {generating ? 'レポート生成中...' : 'レポート生成'}
            </button>
          </div>
        </div>
      </Card>

      {/* レポート選択 */}
      {listLoading ? (
        <Card>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">レポート一覧を読み込み中...</div>
          </div>
        </Card>
      ) : listError ? (
        <Card>
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            レポート一覧の取得に失敗しました。
          </div>
        </Card>
      ) : listData?.reports && listData.reports.length > 0 ? (
        <Card>
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">保存されたレポート</h3>
          <div className="flex flex-wrap gap-2">
            {listData.reports.map((item) => (
              <button
                key={item.reportId}
                onClick={() => setSelectedReportId(item.reportId)}
                className={classNames(
                  'rounded-md px-4 py-2 text-sm font-medium transition-all border',
                  selectedReportId === item.reportId
                    ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white border-transparent'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-[#667eea]'
                )}
              >
                {item.periodYear}年{item.periodMonth}月
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">
              まだレポートがありません。上のボタンからレポートを生成してください。
            </div>
          </div>
        </Card>
      )}

      {/* レポート表示 */}
      {selectedReportId && (
        reportLoading ? (
          <Card>
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">レポートを読み込み中...</div>
            </div>
          </Card>
        ) : reportError ? (
          <Card>
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              レポートの取得に失敗しました。
            </div>
          </Card>
        ) : reportData?.report ? (
          <SavedReportView report={reportData.report} />
        ) : null
      )}
    </div>
  );
}
