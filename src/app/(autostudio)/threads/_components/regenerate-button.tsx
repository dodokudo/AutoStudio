"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

type ModalState = 'hidden' | 'progress' | 'success' | 'error';

type StreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'start'; total: number }
  | { type: 'progress'; stage: string; current: number; total: number; elapsedMs?: number }
  | { type: 'complete'; itemsCount: number }
  | { type: 'error'; message: string };

interface ProgressState {
  current: number;
  total: number;
}

function clampPercentage(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) {
    return `残り約${rounded}秒`;
  }
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (secs === 0) {
    return `残り約${minutes}分`;
  }
  return `残り約${minutes}分${secs}秒`;
}

export function RegenerateButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState<ModalState>('hidden');
  const [stageMessage, setStageMessage] = useState('生成準備中…');
  const [progressState, setProgressState] = useState<ProgressState>({ current: 0, total: 0 });
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const resetState = () => {
    setModalState('hidden');
    setStageMessage('生成準備中…');
    setProgressState({ current: 0, total: 0 });
    setEtaSeconds(null);
    setItemsCount(0);
    setErrorMessage(null);
    startTimeRef.current = null;
  };

  const handleStreamEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'stage':
        setStageMessage(event.message);
        if (event.stage !== 'generating') {
          setEtaSeconds(null);
        }
        return false;
      case 'start':
        setProgressState({ current: 0, total: event.total });
        startTimeRef.current = Date.now();
        return false;
      case 'progress': {
        const { current, total } = event;
        setProgressState({ current, total });
        if (event.stage === 'generating' && current > 0 && total > current) {
          const startedAt = startTimeRef.current ?? Date.now();
          const elapsedMs = Date.now() - startedAt;
          const avgPerItemMs = elapsedMs / current;
          const remainingSeconds = ((total - current) * avgPerItemMs) / 1000;
          const formatted = formatEta(remainingSeconds);
          setEtaSeconds(formatted ? remainingSeconds : null);
        } else {
          setEtaSeconds(null);
        }
        return false;
      }
      case 'complete':
        setItemsCount(event.itemsCount);
        setProgressState((prev) => {
          const total = prev.total || event.itemsCount || prev.current;
          return { current: total, total };
        });
        setStageMessage('生成が完了しました。ページを更新して新しい投稿案を確認できます。');
        setEtaSeconds(null);
        setModalState('success');
        return true;
      case 'error':
        setErrorMessage(event.message);
        setModalState('error');
        setEtaSeconds(null);
        return true;
      default:
        return false;
    }
  };

  const handleClick = async () => {
    if (loading) return;

    resetState();
    setModalState('progress');
    setLoading(true);

    try {
      const res = await fetch('/api/threads/generate', {
        method: 'POST',
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '生成APIが失敗しました');
      }

      if (!res.body) {
        throw new Error('ストリーミング応答が利用できません');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let shouldStop = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              const event = JSON.parse(line) as StreamEvent;
              const stop = handleStreamEvent(event);
              if (stop) {
                shouldStop = true;
                break;
              }
            } catch (error) {
              console.error('[threads/generate] Failed to parse stream line', error, line);
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }

        if (done || shouldStop) {
          if (!done) {
            await reader.cancel();
          }
          break;
        }
      }
    } catch (error) {
      console.error('[threads/generate] Streaming failed', error);
      setErrorMessage((error as Error).message ?? '不明なエラーが発生しました');
      setModalState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
    resetState();
  };

  const disabled = loading || isPending;
  const { current, total } = progressState;
  const percentage = clampPercentage(total ? (current / total) * 100 : 0);
  const progressLabel = total ? `${current} / ${total} 投稿生成済み` : current ? `${current} 件処理済み` : '準備中';
  const formattedEta = etaSeconds ? formatEta(etaSeconds) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:opacity-90 disabled:opacity-60 dark:from-primary dark:to-secondary"
        >
          {disabled ? '生成中…' : '投稿案を自動生成'}
        </button>

        <Link
          href="/threads/logs"
          className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white hover:shadow-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          投稿ログ
        </Link>
      </div>

      {modalState === 'progress' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">生成中…</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{stageMessage}</p>
            <div className="mt-5">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all duration-300 ease-out dark:bg-indigo-400"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{progressLabel}</span>
                <span>{Math.round(percentage)}%</span>
              </div>
              {formattedEta ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{formattedEta}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {modalState === 'success' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">生成完了</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              投稿案の生成が完了しました（{itemsCount}件）。<br />
              ページを更新して最新の投稿案をご確認ください。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={resetState}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                閉じる
              </button>
              <button
                onClick={handleRefresh}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {isPending ? '更新中…' : 'ページを更新'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalState === 'error' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30">
                <svg className="h-5 w-5 text-rose-600 dark:text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M4.93 4.93l14.14 14.14" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">生成に失敗しました</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {errorMessage ?? '不明なエラーが発生しました。時間を置いて再度お試しください。'}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={resetState}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
