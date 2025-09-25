"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function RegenerateButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

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
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      alert(`生成に失敗しました: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || isPending;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:opacity-90 disabled:opacity-60 dark:from-primary dark:to-secondary"
    >
      {disabled ? '生成中…' : '投稿案を自動生成'}
    </button>
  );
}
