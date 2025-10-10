'use client';

import { useState, useEffect, useMemo } from 'react';
import type { InstagramDashboardData } from '@/lib/instagram/dashboard';
import { StatPill } from '@/components/StatPill';
import LoadingScreen from '@/components/LoadingScreen';
import { useDateRange, DatePreset } from '@/lib/dateRangeStore';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface Props {
  data: InstagramDashboardData;
}

const formatDateForInput = (date?: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().split('T')[0];
};

const parseDate = (dateStr: string) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  try {
    const str = dateStr.trim();

    // ISO形式: "2025-06-20"
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // ISO日時形式: "2025-09-14T12:02:33Z" または "2025-09-14 12:02:33"
    const isoDateTimeMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]/);
    if (isoDateTimeMatch) {
      const [, year, month, day] = isoDateTimeMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    return null;
  } catch (error) {
    console.error('parseDate エラー:', error, '元値:', dateStr);
    return null;
  }
};

export function InstagramDashboardView({ data }: Props) {
  const { dateRange, updatePreset } = useDateRange();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(dateRange.start));
  const [customEndDate, setCustomEndDate] = useState(() => formatDateForInput(dateRange.end));
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reelSortBy, setReelSortBy] = useState('date');
  const [reelSortOrder, setReelSortOrder] = useState('desc');
  const [storySortBy, setStorySortBy] = useState('date');
  const [storySortOrder, setStorySortOrder] = useState('desc');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    setMounted(true);

    // ダークモード初期化
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    setCustomStartDate(formatDateForInput(dateRange.start));
    setCustomEndDate(formatDateForInput(dateRange.end));
  }, [dateRange.start, dateRange.end, dateRange.preset]);

  // フィルタリング: dateRangeに基づいてデータを絞り込む
  const filteredReels = useMemo(() => {
    if (dateRange.preset === 'all') return data.reels;

    return data.reels.filter(reel => {
      if (!reel.timestamp) return false;
      const reelDate = parseDate(reel.timestamp);
      if (!reelDate) return false;

      return reelDate >= dateRange.start && reelDate <= dateRange.end;
    });
  }, [data.reels, dateRange]);

  const filteredStories = useMemo(() => {
    if (dateRange.preset === 'all') return data.stories;

    return data.stories.filter(story => {
      if (!story.timestamp) return false;
      const storyDate = parseDate(story.timestamp);
      if (!storyDate) return false;

      return storyDate >= dateRange.start && storyDate <= dateRange.end;
    });
  }, [data.stories, dateRange]);

  // ソート済みリール
  const sortedReels = useMemo(() => {
    const sorted = [...filteredReels].sort((a, b) => {
      let aValue: number | string | null = 0;
      let bValue: number | string | null = 0;

      switch (reelSortBy) {
        case 'date':
          aValue = a.timestamp || '';
          bValue = b.timestamp || '';
          break;
        case 'views':
          aValue = a.views || 0;
          bValue = b.views || 0;
          break;
        case 'likes':
          aValue = a.likeCount || 0;
          bValue = b.likeCount || 0;
          break;
        case 'saves':
          aValue = a.saved || 0;
          bValue = b.saved || 0;
          break;
        case 'comments':
          aValue = a.commentsCount || 0;
          bValue = b.commentsCount || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return reelSortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return reelSortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
      }

      return 0;
    });

    return sorted;
  }, [filteredReels, reelSortBy, reelSortOrder]);

  // ソート済みストーリー
  const sortedStories = useMemo(() => {
    const sorted = [...filteredStories].sort((a, b) => {
      let aValue: number | string | null = 0;
      let bValue: number | string | null = 0;

      switch (storySortBy) {
        case 'date':
          aValue = a.timestamp || '';
          bValue = b.timestamp || '';
          break;
        case 'views':
          aValue = a.views || 0;
          bValue = b.views || 0;
          break;
        case 'viewRate':
          aValue = a.completionRate || 0;
          bValue = b.completionRate || 0;
          break;
        case 'reactions':
          aValue = a.replies || 0;
          bValue = b.replies || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return storySortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return storySortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
      }

      return 0;
    });

    return sorted;
  }, [filteredStories, storySortBy, storySortOrder]);

  // サマリー計算
  const summary = useMemo(() => {
    const latestFollower = data.latestFollower;

    return {
      currentFollowers: latestFollower?.followers || 0,
      followerGrowth: 0, // BigQueryデータには含まれない場合は0
      latestReach: latestFollower?.reach || 0,
      latestEngagement: latestFollower?.engagement || 0,
      totalReels: data.reels.length,
      totalStories: data.stories.length,
    };
  }, [data]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
      {/* SaaS風アクセント - デスクトップのみ */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 to-blue-500 hidden lg:block"></div>

      {/* Mobile Fixed Header - YouTube Studio風 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white shadow-sm h-[60px]">
        <div className="flex items-center justify-between px-5 h-full">
          {/* 左: ロゴ */}
          <div className="flex items-center flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-emerald-400 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">
              Instagram Analytics
            </h1>
          </div>

          {/* 右: 期間セレクト */}
          <div className="flex items-center">
            <select
              value={dateRange.preset}
              onChange={(e) => {
                const value = e.target.value as DatePreset;
                if (value === 'custom') {
                  setCustomStartDate(formatDateForInput(dateRange.start));
                  setCustomEndDate(formatDateForInput(dateRange.end));
                  setShowCustomDateModal(true);
                } else {
                  updatePreset(value);
                }
              }}
              className="rounded-lg border border-gray-500 bg-white text-gray-900 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 min-w-[100px]"
            >
              <option value="yesterday">昨日</option>
              <option value="this-week">今週</option>
              <option value="last-week">先週</option>
              <option value="this-month">今月</option>
              <option value="last-month">先月</option>
              <option value="custom">カスタム期間</option>
            </select>
          </div>
        </div>
      </div>

      {/* Desktop Container */}
      <div className="max-w-7xl mx-auto lg:px-6 lg:py-8 relative z-10 lg:pt-8 pt-16 pb-20 lg:pb-8">
        {/* TopBar: 左サービス名、中央タブ、右期間セレクト - デスクトップのみ */}
        <div className="hidden lg:flex items-center justify-between mb-8 bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-sm p-5">
          {/* 左: サービス名 */}
          <div className="flex items-center flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-emerald-400 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-200">
              Instagram Analytics
            </h1>
          </div>

          {/* 中央: タブ (デスクトップのみ) */}
          <div className="hidden lg:flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              📊 ホーム
            </button>
            <button
              onClick={() => setActiveTab('reels')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'reels'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🎬 リール
            </button>
            <button
              onClick={() => setActiveTab('stories')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'stories'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              📱 ストーリー
            </button>
            <button
              onClick={() => setActiveTab('scripts')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'scripts'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              📝 台本
            </button>
          </div>

          {/* 右: 期間セレクト + ダークモード切替 */}
          <div className="flex items-center space-x-3 flex-shrink-0">
            <select
              value={dateRange.preset}
              onChange={(e) => {
                const value = e.target.value as DatePreset;
                if (value === 'custom') {
                  setCustomStartDate(formatDateForInput(dateRange.start));
                  setCustomEndDate(formatDateForInput(dateRange.end));
                  setShowCustomDateModal(true);
                } else {
                  updatePreset(value);
                }
              }}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-400 focus:border-purple-400 transition-all duration-200 min-w-[120px]"
            >
              <option value="yesterday">昨日</option>
              <option value="this-week">今週</option>
              <option value="last-week">先週</option>
              <option value="this-month">今月</option>
              <option value="last-month">先月</option>
              <option value="custom">カスタム期間</option>
            </select>

            {/* ダークモード切替トグル */}
            <button
              onClick={() => {
                const newIsDark = !isDarkMode;
                setIsDarkMode(newIsDark);
                if (newIsDark) {
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                } else {
                  document.documentElement.classList.remove('dark');
                  localStorage.setItem('theme', 'light');
                }
              }}
              className="relative inline-flex h-8 w-14 items-center rounded-full bg-orange-100 dark:bg-indigo-900 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 hover:scale-105"
              title={isDarkMode ? "ライトモードに切替" : "ダークモードに切替"}
            >
              {/* 背景アイコン */}
              <span className="absolute left-1 text-orange-500 text-sm">🌞</span>
              <span className="absolute right-1 text-indigo-400 text-sm">🌙</span>

              {/* スライダー */}
              <span
                className={`inline-flex h-6 w-6 items-center justify-center transform rounded-full bg-white dark:bg-gray-200 shadow-lg transition-all duration-300 ease-in-out ${
                  isDarkMode ? 'translate-x-7' : 'translate-x-1'
                }`}
              >
                <span className="text-sm">
                  {isDarkMode ? '🌙' : '🌞'}
                </span>
              </span>
              <span className="sr-only">ダークモード切替</span>
            </button>
          </div>
        </div>

        {/* Main Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 lg:space-y-6 lg:px-0">
            {/* PC版上部セクション: サマリー統計 */}
            <div className="hidden lg:block">
              <div className="bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-200 mb-4">アカウント概要</h2>
                <div className="grid grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">フォロワー</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-200">{summary.currentFollowers.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">リーチ</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-200">{summary.latestReach.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">エンゲージメント</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-200">{summary.latestEngagement.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">LINE登録数</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-200">
                      {data.lineRegistrationCount !== null ? data.lineRegistrationCount.toLocaleString() : '-'}
                    </p>
                    {data.lineRegistrationCount !== null && summary.latestReach > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        遷移率: {((data.lineRegistrationCount / summary.latestReach) * 100).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* フォロワー推移グラフ */}
            <div className="bg-white lg:dark:bg-slate-800 border border-gray-100 lg:border-gray-200/70 lg:dark:border-white/10 rounded-lg lg:rounded-2xl shadow-md lg:shadow-sm p-4 lg:p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200 mb-4">フォロワー推移</h3>
              {data.followerSeries.length > 0 ? (
                <div className="h-72 lg:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={data.followerSeries.slice().reverse()}
                      margin={{ top: 12, right: 20, left: 24, bottom: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={{ stroke: '#D1D5DB' }}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={{ stroke: '#D1D5DB' }}
                        tickFormatter={(value) => value.toLocaleString()}
                      />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="followers" fill="#8B5CF6" name="フォロワー" />
                      <Line yAxisId="left" type="monotone" dataKey="reach" stroke="#10B981" name="リーチ" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="engagement" stroke="#F59E0B" name="エンゲージメント" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">データがありません</p>
              )}
            </div>

            {/* Top リール */}
            <div className="lg:px-0 sm:px-3 px-1">
              <div className="bg-white lg:dark:bg-slate-800 border border-gray-100 lg:border-gray-200/70 lg:dark:border-white/10 rounded-lg lg:rounded-2xl shadow-md lg:shadow-sm p-4 lg:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200">Top 5 リール</h3>
                  <button
                    onClick={() => setActiveTab('reels')}
                    className="bg-gradient-to-r from-purple-500 to-emerald-400 hover:from-purple-600 hover:to-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    詳細 →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {sortedReels.slice(0, 5).map((reel, index) => (
                    <div key={reel.instagramId} className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-lg transition-all duration-200">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {reel.timestamp ? new Date(reel.timestamp).toLocaleDateString('ja-JP') : 'N/A'}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-3 line-clamp-2">
                        {reel.caption || 'キャプションなし'}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs">
                          <span className="mr-1">👁️</span>
                          <span className="font-semibold">{(reel.views || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center text-xs">
                          <span className="mr-1">❤️</span>
                          <span className="font-semibold">{(reel.likeCount || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center text-xs">
                          <span className="mr-1">💬</span>
                          <span className="font-semibold">{(reel.commentsCount || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top ストーリー */}
            <div className="lg:px-0 sm:px-3 px-1">
              <div className="bg-white lg:dark:bg-slate-800 border border-gray-100 lg:border-gray-200/70 lg:dark:border-white/10 rounded-lg lg:rounded-2xl shadow-md lg:shadow-sm p-4 lg:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200">Top 5 ストーリー</h3>
                  <button
                    onClick={() => setActiveTab('stories')}
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    詳細 →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {sortedStories.slice(0, 5).map((story, index) => (
                    <div key={story.instagramId} className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-lg transition-all duration-200">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {story.timestamp ? new Date(story.timestamp).toLocaleDateString('ja-JP') : 'N/A'}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-3 line-clamp-2">
                        {story.caption || 'キャプションなし'}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs">
                          <span className="mr-1">👁️</span>
                          <span className="font-semibold">{(story.views || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center text-xs">
                          <span className="mr-1">📊</span>
                          <span className="font-semibold">{((story.completionRate || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center text-xs">
                          <span className="mr-1">💬</span>
                          <span className="font-semibold">{(story.replies || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reels Tab */}
        {activeTab === 'reels' && (
          <div className="space-y-6 px-4 lg:px-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200">リール一覧</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={reelSortBy}
                    onChange={(e) => setReelSortBy(e.target.value)}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="date">日付</option>
                    <option value="views">再生数</option>
                    <option value="likes">いいね</option>
                    <option value="saves">保存</option>
                    <option value="comments">コメント</option>
                  </select>
                  <button
                    onClick={() => setReelSortOrder(reelSortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md"
                  >
                    {reelSortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedReels.map((reel) => (
                  <div key={reel.instagramId} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-lg transition-all duration-200">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-2 line-clamp-2">
                      {reel.caption || 'キャプションなし'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {reel.timestamp ? new Date(reel.timestamp).toLocaleDateString('ja-JP') : 'N/A'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatPill icon="👁️" value={reel.views || 0} color="blue" />
                      <StatPill icon="❤️" value={reel.likeCount || 0} color="red" />
                      <StatPill icon="💬" value={reel.commentsCount || 0} color="green" />
                      <StatPill icon="💾" value={reel.saved || 0} color="purple" />
                      <StatPill icon="↗️" value={reel.shares || 0} color="orange" />
                    </div>
                    {reel.permalink && (
                      <a
                        href={reel.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block text-sm text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        リールを開く →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Stories Tab */}
        {activeTab === 'stories' && (
          <div className="space-y-6 px-4 lg:px-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200">ストーリー一覧</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={storySortBy}
                    onChange={(e) => setStorySortBy(e.target.value)}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="date">日付</option>
                    <option value="views">閲覧数</option>
                    <option value="viewRate">完読率</option>
                    <option value="reactions">リアクション</option>
                  </select>
                  <button
                    onClick={() => setStorySortOrder(storySortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md"
                  >
                    {storySortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedStories.map((story) => (
                  <div key={story.instagramId} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-lg transition-all duration-200">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-2 line-clamp-2">
                      {story.caption || 'キャプションなし'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {story.timestamp ? new Date(story.timestamp).toLocaleDateString('ja-JP') : 'N/A'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatPill icon="👁️" value={story.views || 0} color="blue" />
                      <StatPill icon="📊" value={`${((story.completionRate || 0) * 100).toFixed(1)}%`} color="purple" />
                      <StatPill icon="💬" value={story.replies || 0} color="green" />
                      <StatPill icon="👤" value={story.profileVisits || 0} color="orange" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scripts Tab */}
        {activeTab === 'scripts' && (
          <div className="space-y-6 px-4 lg:px-0">
            <div className="bg-white dark:bg-slate-800 border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200 mb-6">リール台本案</h3>
              {data.scripts.length > 0 ? (
                <div className="space-y-4">
                  {data.scripts.map((script, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-3">{script.title}</h4>
                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Hook</p>
                          <p className="text-gray-900 dark:text-gray-200 mt-1">{script.hook}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Body</p>
                          <p className="text-gray-900 dark:text-gray-200 mt-1 whitespace-pre-line">{script.body}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">CTA</p>
                          <p className="text-gray-900 dark:text-gray-200 mt-1">{script.cta}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Story</p>
                          <p className="text-gray-900 dark:text-gray-200 mt-1 whitespace-pre-line">{script.storyText}</p>
                        </div>
                        {script.inspirationSources.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Inspiration</p>
                            <p className="text-gray-900 dark:text-gray-200 mt-1">{script.inspirationSources.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">台本データがありません</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* カスタム日付モーダル */}
      {showCustomDateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-200 mb-4">カスタム期間</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">開始日</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">終了日</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 px-3 py-2"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      updatePreset('custom', new Date(customStartDate), new Date(customEndDate));
                    }
                    setShowCustomDateModal(false);
                  }}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-all"
                >
                  適用
                </button>
                <button
                  onClick={() => setShowCustomDateModal(false)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="grid grid-cols-4 h-16">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center ${
              activeTab === 'dashboard' ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">📊</span>
            <span className="text-xs mt-1">ホーム</span>
          </button>
          <button
            onClick={() => setActiveTab('reels')}
            className={`flex flex-col items-center justify-center ${
              activeTab === 'reels' ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">🎬</span>
            <span className="text-xs mt-1">リール</span>
          </button>
          <button
            onClick={() => setActiveTab('stories')}
            className={`flex flex-col items-center justify-center ${
              activeTab === 'stories' ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">📱</span>
            <span className="text-xs mt-1">ストーリー</span>
          </button>
          <button
            onClick={() => setActiveTab('scripts')}
            className={`flex flex-col items-center justify-center ${
              activeTab === 'scripts' ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            <span className="text-xl">📝</span>
            <span className="text-xs mt-1">台本</span>
          </button>
        </div>
      </div>
    </div>
  );
}
