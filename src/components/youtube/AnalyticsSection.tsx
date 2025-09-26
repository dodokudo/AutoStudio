'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  last30Days: {
    views: number;
    watchTime: number;
    subscribersGained: number;
    subscribersLost: number;
    demographics: {
      gender: Record<string, number>;
      geography: Record<string, number>;
    };
    trafficSources: Record<string, number>;
    revenue?: {
      estimatedRevenue: number;
      cpm: number;
      rpm: number;
    };
  };
  trends: {
    viewsGrowth: number;
    subscriberNetGrowth: number;
    avgWatchTime: number;
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
    } catch (err) {
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
    } catch (err) {
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

  const { last30Days, trends } = analyticsData;

  return (
    <section className="space-y-6">
      {/* Analytics概要 */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-base font-semibold text-white mb-4">YouTube Analytics (直近30日)</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">総視聴回数</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {last30Days.views.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">総視聴時間</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {Math.round(last30Days.watchTime / 3600).toLocaleString()}h
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">登録者増減</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              +{(last30Days.subscribersGained - last30Days.subscribersLost).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">平均視聴時間</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {Math.round(trends.avgWatchTime)}秒
            </p>
          </div>
        </div>
      </div>

      {/* 視聴者属性 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-base font-semibold text-white mb-4">視聴者属性</h3>
          <div className="space-y-3">
            {Object.entries(last30Days.demographics.gender).map(([gender, percentage]) => (
              <div key={gender} className="flex justify-between items-center">
                <span className="text-sm text-slate-300">{gender}</span>
                <span className="text-sm font-medium text-white">{percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-base font-semibold text-white mb-4">地域別視聴者</h3>
          <div className="space-y-3">
            {Object.entries(last30Days.demographics.geography)
              .slice(0, 5)
              .map(([country, views]) => (
                <div key={country} className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">{country}</span>
                  <span className="text-sm font-medium text-white">{views.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* 収益情報（利用可能な場合） */}
      {last30Days.revenue && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-base font-semibold text-white mb-4">収益情報 (直近30日)</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">推定収益</p>
              <p className="mt-3 text-2xl font-semibold text-green-400">
                ${last30Days.revenue.estimatedRevenue.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">CPM</p>
              <p className="mt-3 text-2xl font-semibold text-white">
                ${last30Days.revenue.cpm.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">RPM</p>
              <p className="mt-3 text-2xl font-semibold text-white">
                ${last30Days.revenue.rpm.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}