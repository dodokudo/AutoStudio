'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

type MaybePostedLog = {
  logId?: unknown;
  log_id?: unknown;
  planId?: unknown;
  plan_id?: unknown;
  jobId?: unknown;
  job_id?: unknown;
  status?: unknown;
  mainText?: unknown;
  main_text?: unknown;
  templateId?: unknown;
  template_id?: unknown;
  theme?: unknown;
  scheduledTime?: unknown;
  scheduled_time?: unknown;
  postedThreadId?: unknown;
  posted_thread_id?: unknown;
  postedAt?: unknown;
  posted_at?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  errorMessage?: unknown;
  error_message?: unknown;
};

interface PostedLogEntry {
  logId: string;
  planId: string;
  status: string;
  mainText: string;
  templateId?: string;
  theme?: string;
  scheduledTime?: string;
  postedThreadId?: string;
  postedAt?: string;
  createdAt?: string;
  jobId?: string;
  errorMessage?: string;
}

interface PostedContentProps {
  initialLogs?: MaybePostedLog[];
}

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || value instanceof Date) {
    return String(value);
  }
  return undefined;
};

const formatTokyoDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const parseToTokyoDateString = (value?: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return formatTokyoDate(parsed);
};

const normalizeLogs = (rawLogs: MaybePostedLog[] | undefined): PostedLogEntry[] => {
  if (!rawLogs || !Array.isArray(rawLogs)) {
    return [];
  }

  const todayTokyo = formatTokyoDate(new Date());

  return rawLogs.flatMap((raw): PostedLogEntry[] => {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const statusRaw = toOptionalString(raw.status);
    const normalizedStatus = statusRaw?.trim().toLowerCase() ?? 'unknown';
    const mainText = toOptionalString(raw.mainText ?? raw.main_text) ?? '';

    const isPosted =
      normalizedStatus === 'success' ||
      normalizedStatus === 'succeeded' ||
      normalizedStatus === 'posted' ||
      normalizedStatus === 'complete' ||
      normalizedStatus === 'completed';

    if (!isPosted || mainText.trim().length === 0) {
      return [];
    }

    const planId = (toOptionalString(raw.planId ?? raw.plan_id) ?? '').trim() || 'unknown';
    const postedAt = toOptionalString(raw.postedAt ?? raw.posted_at);
    const createdAt = toOptionalString(raw.createdAt ?? raw.created_at);
    const logTokyoDate = parseToTokyoDateString(postedAt) ?? parseToTokyoDateString(createdAt);
    if (!logTokyoDate || logTokyoDate !== todayTokyo) {
      return [];
    }

    const logId =
      toOptionalString(raw.logId ?? raw.log_id) ??
      `${planId}-${postedAt ?? createdAt ?? String(Date.now())}`;

    return [{
      logId,
      planId,
      status: normalizedStatus,
      mainText,
      templateId: (toOptionalString(raw.templateId ?? raw.template_id)?.trim() || undefined),
      theme: (toOptionalString(raw.theme)?.trim() || undefined),
      scheduledTime: (toOptionalString(raw.scheduledTime ?? raw.scheduled_time)?.trim() || undefined),
      postedThreadId: (toOptionalString(raw.postedThreadId ?? raw.posted_thread_id)?.trim() || undefined),
      postedAt,
      createdAt,
      jobId: (toOptionalString(raw.jobId ?? raw.job_id)?.trim() || undefined),
      errorMessage: (toOptionalString(raw.errorMessage ?? raw.error_message)?.trim() || undefined),
    }];
  });
};

const formatTimestamp = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

export function PostedContent({ initialLogs = [] }: PostedContentProps) {
  const [postedLogs, setPostedLogs] = useState<PostedLogEntry[]>(() => normalizeLogs(initialLogs));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPostedLogs(normalizeLogs(initialLogs));
  }, [initialLogs]);

  const fetchPostedLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/threads/logs', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.status}`);
      }
      const data = await response.json();
      setPostedLogs(normalizeLogs(data.logs));
    } catch (err) {
      console.error('Failed to fetch posted logs:', err);
      setError('投稿済みのコンテンツの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = postedLogs.length;
    if (total === 0) {
      return { total, latestAt: null as string | null };
    }
    const latest = postedLogs
      .map((log) => log.postedAt ?? log.createdAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;

    return { total, latestAt: latest };
  }, [postedLogs]);

  return (
    <Card>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">投稿済みコンテンツ</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            投稿完了したThreadsのコンテンツと本文を一覧で確認できます。
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f0f0f0] px-3 py-1 text-xs text-[#4a5568]">
              計 {stats.total} 件
            </span>
            <Button variant="secondary" onClick={fetchPostedLogs} disabled={isLoading}>
              {isLoading ? '更新中…' : '更新'}
            </Button>
          </div>
          {stats.latestAt ? (
            <span className="text-xs text-[color:var(--color-text-muted)]">
              最終更新: {formatTimestamp(stats.latestAt)}
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[#fbd5d5] bg-[#fff5f5] p-4 text-sm text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {postedLogs.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="投稿済みのコンテンツはありません" description="投稿が完了すると、ここに最新の内容が表示されます。" />
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {postedLogs.map((log) => (
            <div
              key={log.logId}
              className="flex h-full flex-col rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-secondary)]">
                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium">
                  投稿日時 {formatTimestamp(log.postedAt ?? log.createdAt)}
                </span>
                <span className="rounded-full bg-[#e6f7ed] px-2.5 py-1 text-[11px] font-medium text-[#096c3e]">
                  投稿済み
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                <span>Plan {log.planId}</span>
                {log.scheduledTime ? <span>予定時刻: {log.scheduledTime}</span> : null}
                {log.templateId ? <span>テンプレート: {log.templateId}</span> : null}
              </div>

              {log.theme ? (
                <p className="mt-3 text-sm font-medium text-[color:var(--color-text-primary)] break-words">
                  {log.theme}
                </p>
              ) : null}

              <div className="mt-4 flex-1">
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 text-sm">
                  <div className="whitespace-pre-wrap break-words text-[color:var(--color-text-primary)]">
                    {log.mainText}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] p-3 text-xs text-[color:var(--color-text-secondary)] break-words">
                {log.postedThreadId ? (
                  <p>
                    <span className="font-medium text-[color:var(--color-text-primary)]">Thread ID</span>: {log.postedThreadId}
                  </p>
                ) : null}
                {log.jobId ? (
                  <p>
                    <span className="font-medium text-[color:var(--color-text-primary)]">Job ID</span>: {log.jobId}
                  </p>
                ) : null}
                {log.errorMessage ? (
                  <p className="text-[#b91c1c]">
                    <span className="font-medium">エラー</span>: {log.errorMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
