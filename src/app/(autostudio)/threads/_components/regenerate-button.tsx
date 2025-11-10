"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  return secs === 0 ? `残り約${minutes}分` : `残り約${minutes}分${secs}秒`;
}

type PostType = 'ai-tips' | 'threads-operation';

export function RegenerateButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [postType, setPostType] = useState<PostType>('ai-tips');
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
      const apiEndpoint = postType === 'ai-tips'
        ? '/api/threads/generate'
        : '/api/threads/generate-operation';

      const res = await fetch(apiEndpoint, { method: 'POST' });
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

  const { current, total } = progressState;
  const percentage = clampPercentage(total ? (current / total) * 100 : 0);
  const progressLabel = total ? `${current} / ${total} 投稿生成済み` : current ? `${current} 件処理済み` : '準備中';
  const formattedEta = etaSeconds ? formatEta(etaSeconds) : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1">
        <button
          onClick={() => setPostType('ai-tips')}
          disabled={loading || isPending}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            postType === 'ai-tips'
              ? 'bg-[color:var(--color-accent)] text-white'
              : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
          } disabled:opacity-50`}
        >
          AI活用系
        </button>
        <button
          onClick={() => setPostType('threads-operation')}
          disabled={loading || isPending}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            postType === 'threads-operation'
              ? 'bg-[color:var(--color-accent)] text-white'
              : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
          } disabled:opacity-50`}
        >
          Threads運用系
        </button>
      </div>
      <Button onClick={handleClick} disabled={loading || isPending}>
        {loading || isPending ? '生成中…' : '投稿案を再生成'}
      </Button>
      <Link href="/threads/logs" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]">
        <Button variant="secondary">生成ログ</Button>
      </Link>

      {modalState === 'progress' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-md">
            <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">投稿を生成しています</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">{stageMessage}</p>
            <div className="mt-5 space-y-2">
              <div className="h-2 rounded-full bg-[#e1e3e6]">
                <div
                  className="h-full rounded-full bg-[color:var(--color-accent)] transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                <span>{progressLabel}</span>
                <span>{Math.round(percentage)}%</span>
              </div>
              {formattedEta ? <p className="text-xs text-[color:var(--color-text-muted)]">{formattedEta}</p> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {modalState === 'success' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-md space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">生成が完了しました</h3>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                {itemsCount}件の投稿案が作成されました。ページを更新して内容をご確認ください。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={resetState}>
                閉じる
              </Button>
              <Button onClick={handleRefresh} disabled={isPending}>
                {isPending ? '更新中…' : 'ページを更新'}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {modalState === 'error' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-md space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">生成に失敗しました</h3>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                {errorMessage ?? '不明なエラーが発生しました。時間を置いて再度お試しください。'}
              </p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={resetState}>
                閉じる
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
