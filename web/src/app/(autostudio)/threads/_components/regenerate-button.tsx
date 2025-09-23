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
      className="rounded-lg bg-indigo-500/20 px-4 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/30 disabled:opacity-50"
    >
      {disabled ? '生成中…' : '投稿案を自動生成'}
    </button>
  );
}
