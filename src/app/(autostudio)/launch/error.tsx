'use client';

import { useEffect } from 'react';

export default function LaunchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Launch] Render error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
        ページの表示中にエラーが発生しました
      </h2>
      <p className="text-sm text-[color:var(--color-text-muted)]">
        {error.message || '不明なエラーが発生しました'}
      </p>
      <button
        onClick={reset}
        className="rounded-[var(--radius-sm)] bg-[color:var(--color-accent)] px-6 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
      >
        再読み込み
      </button>
    </div>
  );
}
