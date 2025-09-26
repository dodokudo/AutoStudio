"use client";

import useSWR from 'swr';
import { PostingLogsList } from './posting-logs-list';

interface PostingLog {
  log_id: string;
  plan_id: string;
  status: string;
  posted_thread_id?: string;
  error_message?: string;
  posted_at?: string;
  created_at: string;
  main_text: string;
  template_id: string;
  theme: string;
  scheduled_time: string;
}

interface LogsResponse {
  logs: PostingLog[];
  total: number;
}

const fetcher = async (url: string): Promise<LogsResponse> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch logs');
  }
  return res.json();
};

export function PostingLogsContainer() {
  const { data, error, isLoading } = useSWR<LogsResponse>('/api/threads/logs', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30000, // 30秒ごとに更新
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-4">
            <div className="space-y-2">
              <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
              <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
              <div className="h-20 w-full bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
        <h3 className="font-medium text-destructive">ログの読み込みに失敗しました</h3>
        <p className="text-sm text-destructive/80 mt-1">
          {error.message || '不明なエラーが発生しました'}
        </p>
      </div>
    );
  }

  if (!data || data.logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h3 className="font-medium text-muted-foreground">投稿ログがありません</h3>
        <p className="text-sm text-muted-foreground mt-1">
          投稿を承認すると、ここに投稿結果が表示されます
        </p>
      </div>
    );
  }

  return <PostingLogsList logs={data.logs} />;
}