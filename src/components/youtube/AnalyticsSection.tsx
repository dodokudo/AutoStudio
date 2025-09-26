'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  last30Days: {
    views: number;
    watchTime: number;
    subscribersGained: number;
    subscribersLost: number;
  };
  last7Days: {
    views: number;
    watchTime: number;
    subscribersGained: number;
    subscribersLost: number;
  };
}

export function AnalyticsSection() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube/analytics');
      const result = await response.json();

      if (result.needsAuth) {
        setNeedsAuth(true);
      } else if (result.success) {
        setAnalyticsData(result.data);
        setNeedsAuth(false);
      } else {
        setError(result.error || 'データの取得に失敗しました');
      }
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const startOAuthFlow = async () => {
    try {
      const response = await fetch('/api/youtube/oauth/auth');
      const result = await response.json();

      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch {
      setError('OAuth認証の開始に失敗しました');
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (needsAuth) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <div className="text-center">
          <h2 className="text-base font-semibold text-white mb-4">YouTube Analytics (詳細データ)</h2>
          <p className="text-sm text-slate-400 mb-6">
            詳細な分析データを取得するには、YouTubeアカウントとの連携が必要です。
          </p>
          <button
            onClick={startOAuthFlow}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            YouTube と連携する
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <div className="text-center">
          <h2 className="text-base font-semibold text-white mb-4">YouTube Analytics</h2>
          <p className="text-sm text-slate-400">データを読み込み中...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <div className="text-center">
          <h2 className="text-base font-semibold text-white mb-4">YouTube Analytics</h2>
          <p className="text-sm text-red-400 mb-4">{error}</p>
          <button
            onClick={loadAnalytics}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
          >
            再試行
          </button>
        </div>
      </section>
    );
  }

  if (!analyticsData) {
    return null;
  }

  const { last30Days, last7Days } = analyticsData;

  return (
    <section className="space-y-6">
      {/* Analytics概要 */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-base font-semibold text-white mb-4">YouTube Analytics</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">直近30日</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">視聴回数</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {last30Days.views.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">視聴時間</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {Math.round(last30Days.watchTime / 60).toLocaleString()}分
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">登録者増</p>
                <p className="mt-2 text-lg font-semibold text-green-400">
                  +{last30Days.subscribersGained.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">登録者減</p>
                <p className="mt-2 text-lg font-semibold text-red-400">
                  -{last30Days.subscribersLost.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">直近7日</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">視聴回数</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {last7Days.views.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">視聴時間</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {Math.round(last7Days.watchTime / 60).toLocaleString()}分
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">登録者増</p>
                <p className="mt-2 text-lg font-semibold text-green-400">
                  +{last7Days.subscribersGained.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">登録者減</p>
                <p className="mt-2 text-lg font-semibold text-red-400">
                  -{last7Days.subscribersLost.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}