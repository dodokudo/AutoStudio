'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { KpiTarget, KpiTargetInput } from '@/lib/home/kpi-types';
import { calculateDailyTargets, calculateRequiredRates } from '@/lib/home/kpi-types';

// ============================================================
// 型定義
// ============================================================

interface KpiTargetTabProps {
  initialTarget: KpiTarget | null;
  currentMonth: string;
  onSave: (input: KpiTargetInput) => Promise<KpiTarget>;
  onMonthChange: (month: string) => void;
}

// ============================================================
// ユーティリティ
// ============================================================

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `${formatNumber(value / 10000)}万円`;
  }
  return `${formatNumber(value)}円`;
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10));
}

function sanitizeIntegerInput(value: string): string {
  return normalizeDigits(value).replace(/[^\d]/g, '');
}

function sanitizeDecimalInput(value: string): string {
  const normalized = normalizeDigits(value).replace(/,/g, '');
  const cleaned = normalized.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function parseNumberInput(value: string): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDaysInMonth(month: string): number {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(year, monthNum, 0).getDate();
}

// ============================================================
// コンポーネント
// ============================================================

export function KpiTargetTab({
  initialTarget,
  currentMonth,
  onSave,
  onMonthChange,
}: KpiTargetTabProps) {
  // フォーム状態
  const [targetMonth, setTargetMonth] = useState(initialTarget?.targetMonth ?? currentMonth);
  const [workingDays, setWorkingDays] = useState(initialTarget?.workingDays ?? getDaysInMonth(currentMonth));
  const [targetRevenueInput, setTargetRevenueInput] = useState(() => (
    initialTarget ? String((initialTarget.targetRevenue ?? 0) / 10000) : ''
  ));
  const [targetLineInput, setTargetLineInput] = useState(() => (
    initialTarget ? String(initialTarget.targetLineRegistrations ?? 0) : ''
  ));
  const [targetSeminarInput, setTargetSeminarInput] = useState(() => (
    initialTarget ? String(initialTarget.targetSeminarParticipants ?? 0) : ''
  ));
  const [targetFrontendInput, setTargetFrontendInput] = useState(() => (
    initialTarget ? String(initialTarget.targetFrontendPurchases ?? 0) : ''
  ));
  const [targetBackendInput, setTargetBackendInput] = useState(() => (
    initialTarget ? String(initialTarget.targetBackendPurchases ?? 0) : ''
  ));
  const [targetThreadsFollowersInput, setTargetThreadsFollowersInput] = useState(() => (
    initialTarget ? String(initialTarget.targetThreadsFollowers ?? 0) : ''
  ));
  const [targetInstagramFollowersInput, setTargetInstagramFollowersInput] = useState(() => (
    initialTarget ? String(initialTarget.targetInstagramFollowers ?? 0) : ''
  ));

  // UI状態
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);


  // 現在の入力値からKpiTargetInputを生成
  const currentInput = useMemo<KpiTargetInput>(() => ({
    targetMonth,
    workingDays,
    targetRevenue: parseNumberInput(targetRevenueInput) * 10000,
    targetLineRegistrations: parseNumberInput(targetLineInput),
    targetSeminarParticipants: parseNumberInput(targetSeminarInput),
    targetFrontendPurchases: parseNumberInput(targetFrontendInput),
    targetBackendPurchases: parseNumberInput(targetBackendInput),
    targetThreadsFollowers: parseNumberInput(targetThreadsFollowersInput),
    targetInstagramFollowers: parseNumberInput(targetInstagramFollowersInput),
  }), [targetMonth, workingDays, targetRevenueInput, targetLineInput, targetSeminarInput, targetFrontendInput, targetBackendInput, targetThreadsFollowersInput, targetInstagramFollowersInput]);

  // 自動計算: デイリー目標
  const dailyTargets = useMemo(() => calculateDailyTargets(currentInput), [currentInput]);

  // 自動計算: 必要転換率
  const requiredRates = useMemo(() => calculateRequiredRates(currentInput), [currentInput]);

  // 月変更ハンドラ
  const handleMonthChange = useCallback(async (newMonth: string) => {
            setTargetMonth(newMonth);
            setWorkingDays(getDaysInMonth(newMonth));
            onMonthChange(newMonth);

    // 該当月のデータを取得してフォームにセット
    try {
      const response = await fetch(`/api/home/kpi-targets?month=${newMonth}`);
      if (response.ok) {
        const result = await response.json();
            if (result.success && result.data) {
              const data = result.data;
              if (data.id) {
                // 保存済みデータがある場合
                setWorkingDays(data.workingDays);
                setTargetRevenueInput(String((data.targetRevenue ?? 0) / 10000));
                setTargetLineInput(String(data.targetLineRegistrations ?? 0));
                setTargetSeminarInput(String(data.targetSeminarParticipants ?? 0));
                setTargetFrontendInput(String(data.targetFrontendPurchases ?? 0));
                setTargetBackendInput(String(data.targetBackendPurchases ?? 0));
                setTargetThreadsFollowersInput(String(data.targetThreadsFollowers ?? 0));
                setTargetInstagramFollowersInput(String(data.targetInstagramFollowers ?? 0));
              } else {
                // デフォルト値にリセット
                setTargetRevenueInput('');
                setTargetLineInput('');
                setTargetSeminarInput('');
                setTargetFrontendInput('');
                setTargetBackendInput('');
                setTargetThreadsFollowersInput('');
                setTargetInstagramFollowersInput('');
              }
            }
          }
        } catch (error) {
      console.error('Failed to fetch KPI target:', error);
    }
  }, [onMonthChange]);

  // 保存ハンドラ
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await onSave(currentInput);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [currentInput, onSave]);

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm('目標をリセットしますか？（すべて0で保存されます）');
    if (!confirmed) return;

    setTargetRevenueInput('');
    setTargetLineInput('');
    setTargetSeminarInput('');
    setTargetFrontendInput('');
    setTargetBackendInput('');
    setTargetThreadsFollowersInput('');
    setTargetInstagramFollowersInput('');

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await onSave({
        targetMonth,
        workingDays,
        targetRevenue: 0,
        targetLineRegistrations: 0,
        targetSeminarParticipants: 0,
        targetFrontendPurchases: 0,
        targetBackendPurchases: 0,
        targetThreadsFollowers: 0,
        targetInstagramFollowers: 0,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  }, [onSave, targetMonth, workingDays]);

  return (
    <div className="space-y-6">
      {/* ヘッダー: 対象月・稼働日数 */}
      <Card className={dashboardCardClass}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-[color:var(--color-text-secondary)]">
              対象月
            </label>
            <input
              type="month"
              value={targetMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-[color:var(--color-text-secondary)]">
              稼働日数
            </label>
            <input
              type="number"
              value={workingDays}
              onChange={(e) => setWorkingDays(Math.max(1, Math.min(31, Number(e.target.value))))}
              min={1}
              max={31}
              className="w-20 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] text-center"
            />
            <span className="text-sm text-[color:var(--color-text-muted)]">日</span>
          </div>
        </div>
      </Card>

      {/* 月間目標入力テーブル */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">月間目標入力</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          各KPIの目標値を入力してください。デイリー目標と必要転換率は自動計算されます。
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-3 px-4 text-left font-medium text-[color:var(--color-text-muted)]">項目</th>
                <th className="py-3 px-4 text-right font-medium text-[color:var(--color-text-muted)]">目標値</th>
                <th className="py-3 px-4 text-right font-medium text-[color:var(--color-text-muted)]">デイリー</th>
                <th className="py-3 px-4 text-right font-medium text-[color:var(--color-text-muted)]">達成に必要な率</th>
              </tr>
            </thead>
            <tbody>
              {/* 売上 */}
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">売上</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={targetRevenueInput}
                      onChange={(e) => setTargetRevenueInput(sanitizeDecimalInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">万円</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  {formatCurrency(dailyTargets.dailyRevenue)}/日
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
              </tr>

              {/* LINE登録 */}
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">LINE登録</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetLineInput}
                      onChange={(e) => setTargetLineInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">件</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  {dailyTargets.dailyLineRegistrations.toFixed(1)}件/日
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
              </tr>

              {/* セミナー参加 */}
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">セミナー参加</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetSeminarInput}
                      onChange={(e) => setTargetSeminarInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">件</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  {dailyTargets.dailySeminarParticipants.toFixed(1)}件/日
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  LINE→{formatPercent(requiredRates.lineToSeminar)}
                </td>
              </tr>

              {/* フロントエンド購入 */}
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">フロントエンド購入</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetFrontendInput}
                      onChange={(e) => setTargetFrontendInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">件</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  {dailyTargets.dailyFrontendPurchases.toFixed(1)}件/日
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  セミナー→{formatPercent(requiredRates.seminarToFrontend)}
                </td>
              </tr>

              {/* バックエンド購入 */}
              <tr>
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">バックエンド購入</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetBackendInput}
                      onChange={(e) => setTargetBackendInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">件</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  {dailyTargets.dailyBackendPurchases.toFixed(1)}件/日
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-secondary)]">
                  フロント→{formatPercent(requiredRates.frontendToBackend)}
                </td>
              </tr>

              {/* Threads フォロワー */}
              <tr className="border-t border-[color:var(--color-border)]">
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">Threadsフォロワー目標</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetThreadsFollowersInput}
                      onChange={(e) => setTargetThreadsFollowersInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">人</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
              </tr>

              {/* Instagram フォロワー */}
              <tr>
                <td className="py-4 px-4 font-medium text-[color:var(--color-text-primary)]">Instagramフォロワー目標</td>
                <td className="py-4 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={targetInstagramFollowersInput}
                      onChange={(e) => setTargetInstagramFollowersInput(sanitizeIntegerInput(e.target.value))}
                      className="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-[color:var(--color-text-primary)]"
                    />
                    <span className="text-[color:var(--color-text-muted)]">人</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
                <td className="py-4 px-4 text-right text-[color:var(--color-text-muted)]">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[color:var(--color-text-muted)]">
          ※ 達成に必要な率 = 前ステップの目標から自動計算
        </p>
      </Card>

      {/* ファネル転換率（自動計算） */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル転換率（自動計算）</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          目標達成に必要なステップ間の転換率です。
        </p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] px-4 py-3">
            <span className="text-[color:var(--color-text-secondary)]">LINE → セミナー</span>
            <span className="font-semibold text-[color:var(--color-text-primary)]">{formatPercent(requiredRates.lineToSeminar)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] px-4 py-3">
            <span className="text-[color:var(--color-text-secondary)]">セミナー → フロント</span>
            <span className="font-semibold text-[color:var(--color-text-primary)]">{formatPercent(requiredRates.seminarToFrontend)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] px-4 py-3">
            <span className="text-[color:var(--color-text-secondary)]">フロント → バックエンド</span>
            <span className="font-semibold text-[color:var(--color-text-primary)]">{formatPercent(requiredRates.frontendToBackend)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 px-4 py-3">
            <span className="font-medium text-[color:var(--color-text-primary)]">LINE → バックエンド（総合）</span>
            <span className="font-bold text-[color:var(--color-accent)]">{formatPercent(requiredRates.lineToBackend)}</span>
          </div>
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6"
        >
          {isSaving ? '保存中...' : '保存'}
        </Button>
        <Button
          variant="secondary"
          onClick={handleReset}
          disabled={isSaving}
          className="px-6"
        >
          目標リセット
        </Button>

        {saveSuccess && (
          <span className="text-sm text-green-600">保存しました</span>
        )}
        {saveError && (
          <span className="text-sm text-red-600">{saveError}</span>
        )}
      </div>
    </div>
  );
}
