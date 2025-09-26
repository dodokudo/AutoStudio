"use client";

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

interface PostingLogsListProps {
  logs: PostingLog[];
}

const statusConfig = {
  success: {
    label: '成功',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    icon: '✓'
  },
  failed: {
    label: '失敗',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    icon: '✗'
  },
  pending: {
    label: '処理中',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    icon: '⏳'
  },
  unknown: {
    label: '不明',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
    icon: '?'
  }
};

function formatDateTime(dateString?: string): string {
  if (!dateString) return '不明';

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo'
    }).format(date);
  } catch {
    return '不明';
  }
}

function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function PostingLogsList({ logs }: PostingLogsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">投稿履歴</h2>
        <span className="text-sm text-muted-foreground">
          {logs.length} 件の履歴
        </span>
      </div>

      <div className="space-y-3">
        {logs.map((log) => {
          const status = statusConfig[log.status as keyof typeof statusConfig] || statusConfig.unknown;

          return (
            <div
              key={log.log_id}
              className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${status.className}`}
                    >
                      <span>{status.icon}</span>
                      {status.label}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      ID: {log.plan_id}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      {log.template_id}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-medium text-sm text-primary">
                      {log.theme}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {truncateText(log.main_text)}
                    </p>
                  </div>

                  {log.posted_thread_id && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Thread ID:</span>
                      <code className="bg-muted px-1 py-0.5 rounded text-emerald-600">
                        {log.posted_thread_id}
                      </code>
                    </div>
                  )}

                  {log.error_message && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
                      <span className="font-medium text-red-700 dark:text-red-400">エラー:</span>
                      <p className="text-red-600 dark:text-red-300 mt-1">{log.error_message}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                  <div>
                    投稿時刻: {log.scheduled_time}
                  </div>
                  <div>
                    実行: {formatDateTime(log.posted_at || log.created_at)}
                  </div>
                  <div>
                    作成: {formatDateTime(log.created_at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}