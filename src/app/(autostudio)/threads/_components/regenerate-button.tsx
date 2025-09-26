"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function RegenerateButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/threads/generate', {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setShowSuccessModal(true);
    } catch (error) {
      alert(`生成に失敗しました: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setShowSuccessModal(false);
    startTransition(() => {
      router.refresh();
    });
  };

  const disabled = loading || isPending;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:opacity-90 disabled:opacity-60 dark:from-primary dark:to-secondary"
      >
        {disabled ? '生成中…' : '投稿案を自動生成'}
      </button>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                生成完了
              </h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              文章の生成が完了しました。<br />
              ページを更新して新しい投稿案をご確認ください。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSuccessModal(false)}
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
      )}
    </>
  );
}
