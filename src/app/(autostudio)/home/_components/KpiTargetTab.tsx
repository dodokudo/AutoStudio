'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { KpiTarget, KpiTargetInput } from '@/lib/home/kpi-types';
import { calculateDailyTargets, calculateRequiredRates, getDefaultKpiTarget } from '@/lib/home/kpi-types';

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

function getMonthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();

  // 過去3ヶ月 + 今月 + 未来3ヶ月
  for (let i = -3; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    options.push({ value, label });
  }

  return options;
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
  const [targetRevenue, setTargetRevenue] = useState(initialTarget?.targetRevenue ?? 0);
  const [targetLineRegistrations, setTargetLineRegistrations] = useState(initialTarget?.targetLineRegistrations ?? 0);
  const [targetSeminarParticipants, setTargetSeminarParticipants] = useState(initialTarget?.targetSeminarParticipants ?? 0);
  const [targetFrontendPurchases, setTargetFrontendPurchases] = useState(initialTarget?.targetFrontendPurchases ?? 0);
  const [targetBackendPurchases, setTargetBackendPurchases] = useState(initialTarget?.targetBackendPurchases ?? 0);

  // UI状態
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 月選択オプション
  const monthOptions = useMemo(() => getMonthOptions(), []);

  // 現在の入力値からKpiTargetInputを生成
  const currentInput = useMemo<KpiTargetInput>(() => ({
    targetMonth,
    workingDays,
    targetRevenue,
    targetLineRegistrations,
    targetSeminarParticipants,
    targetFrontendPurchases,
    targetBackendPurchases,
  }), [targetMonth, workingDays, targetRevenue, targetLineRegistrations, targetSeminarParticipants, targetFrontendPurchases, targetBackendPurchases]);

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
            setTargetRevenue(data.targetRevenue);
            setTargetLineRegistrations(data.targetLineRegistrations);
            setTargetSeminarParticipants(data.targetSeminarParticipants);
            setTargetFrontendPurchases(data.targetFrontendPurchases);
            setTargetBackendPurchases(data.targetBackendPurchases);
          } else {
            // デフォルト値にリセット
            setTargetRevenue(0);
            setTargetLineRegistrations(0);
            setTargetSeminarParticipants(0);
            setTargetFrontendPurchases(0);
            setTargetBackendPurchases(0);
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

  return (
    <div className="space-y-6">
      {/* ヘッダー: 対象月・稼働日数 */}
      <Card className={dashboardCardClass}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-[color:var(--color-text-secondary)]">
              対象月
            </label>
            <select
              value={targetMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
                      type="number"
                      value={targetRevenue / 10000}
                      onChange={(e) => setTargetRevenue(Number(e.target.value) * 10000)}
                      min={0}
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
                      type="number"
                      value={targetLineRegistrations}
                      onChange={(e) => setTargetLineRegistrations(Math.max(0, Number(e.target.value)))}
                      min={0}
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
                      type="number"
                      value={targetSeminarParticipants}
                      onChange={(e) => setTargetSeminarParticipants(Math.max(0, Number(e.target.value)))}
                      min={0}
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
                      type="number"
                      value={targetFrontendPurchases}
                      onChange={(e) => setTargetFrontendPurchases(Math.max(0, Number(e.target.value)))}
                      min={0}
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
                      type="number"
                      value={targetBackendPurchases}
                      onChange={(e) => setTargetBackendPurchases(Math.max(0, Number(e.target.value)))}
                      min={0}
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
