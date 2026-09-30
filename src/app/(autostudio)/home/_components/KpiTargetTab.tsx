'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { getDefaultKpiTarget, type KpiTarget, type KpiTargetInput } from '@/lib/home/kpi-types';
import { goalFields, monthDates, targetConversionRows } from '@/lib/home/monthly-plan-types';

export function KpiTargetTab({
  initialTarget,
  currentMonth,
  onSave,
}: {
  initialTarget: KpiTarget | null;
  currentMonth: string;
  onSave: (input: KpiTargetInput) => Promise<KpiTarget>;
}) {
  const defaults = initialTarget ?? {
    ...getDefaultKpiTarget(currentMonth),
    workingDays: Number(monthDates(currentMonth).end.slice(-2)),
  };
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      goalFields.map(([key]) => [
        key,
        defaults[key] > 0 ? String(defaults[key] / (key === 'targetRevenue' ? 10000 : 1)) : '',
      ])
    )
  );
  const [workingDays, setWorkingDays] = useState(String(defaults.workingDays));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const input = {
    ...defaults,
    targetMonth: currentMonth,
    workingDays: Number(workingDays),
    ...Object.fromEntries(
      goalFields.map(([key]) => [key, Math.round(Number(values[key]) * (key === 'targetRevenue' ? 10000 : 1))])
    ),
  } as KpiTargetInput;

  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
          await onSave(input);
          setMessage('目標を保存しました');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : '保存に失敗しました');
        } finally {
          setSaving(false);
        }
      }}
    >
      <Card className={dashboardCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">月間目標</h2>
          <label className="flex items-center gap-2 text-sm">
            稼働日数
            <input
              aria-label="稼働日数"
              type="number"
              required
              min="1"
              max="31"
              step="1"
              value={workingDays}
              onChange={(e) => {
                setWorkingDays(e.target.value);
                setMessage('');
              }}
              className="w-20 rounded border border-[color:var(--color-border)] bg-transparent p-2 text-right"
            />
            日
          </label>
        </div>
        <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
          目標を置かない項目は空欄。稼働日数は1日あたりの目安に使います。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-3 text-left">項目</th>
                <th className="py-3 text-right">月間目標</th>
                <th className="py-3 text-right">1日あたり</th>
              </tr>
            </thead>
            <tbody>
              {goalFields.map(([key, label, unit]) => (
                <tr key={key} className="border-b border-[color:var(--color-border)]">
                  <th className="py-3 text-left font-medium">
                    <label htmlFor={key}>{label}</label>
                  </th>
                  <td className="py-3 text-right whitespace-nowrap">
                    <input
                      id={key}
                      aria-label={`${label}の目標`}
                      type="number"
                      min="0"
                      step={key === 'targetRevenue' ? '0.0001' : '1'}
                      value={values[key]}
                      placeholder="未設定"
                      onChange={(e) => {
                        setValues({ ...values, [key]: e.target.value });
                        setMessage('');
                      }}
                      className="w-28 rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-right"
                    />
                    <span className="ml-2 inline-block w-8">{unit}</span>
                  </td>
                  <td className="py-3 pl-4 text-right text-[color:var(--color-text-muted)]">
                    {input[key] > 0 && input.workingDays > 0
                      ? `${(Number(values[key]) / input.workingDays).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}${unit}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? '保存中…' : '目標を保存'}
          </Button>
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      </Card>
      <Card className={dashboardCardClass}>
        <details>
          <summary className="cursor-pointer font-medium">目標から計算した転換率</summary>
          <div className="mt-4 space-y-3 text-sm">
            {targetConversionRows(input).map(([label, rate]) => (
              <div key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span>{rate}</span>
              </div>
            ))}
          </div>
        </details>
      </Card>
    </form>
  );
}
