'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function DebugPanel() {
  const [isResettingJobs, setIsResettingJobs] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const handleResetFailedJobs = async () => {
    setIsResettingJobs(true);
    setResetResult(null);

    try {
      const response = await fetch('/api/debug/reset-failed-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        setResetResult(`成功: ${data.message} (リセット数: ${data.resetCount})`);
      } else {
        setResetResult(`エラー: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to reset jobs:', error);
      setResetResult('エラー: リクエストの送信に失敗しました');
    } finally {
      setIsResettingJobs(false);
    }
  };

  return (
    <Card>
      <header className="border-b border-[color:var(--color-border)] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">デバッグツール</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            システムの問題を解決するためのデバッグ機能です。
          </p>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
          <h3 className="text-sm font-medium text-[color:var(--color-text-primary)]">失敗したジョブのリセット</h3>
          <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
            &quot;Plan not found for job&quot; エラーで失敗したジョブをリセットして再実行可能にします。
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleResetFailedJobs}
              disabled={isResettingJobs}
            >
              {isResettingJobs ? 'リセット中…' : '失敗ジョブをリセット'}
            </Button>
          </div>
          {resetResult && (
            <div className={`mt-3 rounded-[var(--radius-sm)] p-3 text-xs ${
              resetResult.startsWith('成功')
                ? 'bg-[#e6f7ed] text-[#096c3e]'
                : 'bg-[#fdeded] text-[#a61b1b]'
            }`}>
              {resetResult}
            </div>
          )}
        </div>

        <div className="text-xs text-[color:var(--color-text-muted)]">
          <p>⚠️ これらの機能は開発・デバッグ用です。本番環境での使用は注意して行ってください。</p>
        </div>
      </div>
    </Card>
  );
}