'use client';

import { Card } from '@/components/ui/card';
import type { FunnelAnalysisResult } from '@/lib/lstep/funnel';

interface FunnelAnalysisProps {
  data: FunnelAnalysisResult;
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function FunnelAnalysis({ data }: FunnelAnalysisProps) {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          {data.definition.name}
        </h2>
        {data.definition.description && (
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            {data.definition.description}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--color-border)]">
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--color-text-secondary)]">
                #
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--color-text-secondary)]">
                フェーズ
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">
                移行率
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">
                到達人数(人)
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">
                未到達人数(人)
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">
                全体比
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-[color:var(--color-text-secondary)]">
                視覚化
              </th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((step, index) => {
              const isFirst = index === 0;
              const conversionColor = step.conversionRate >= 50 ? 'text-green-600' : step.conversionRate >= 20 ? 'text-yellow-600' : 'text-red-600';

              return (
                <tr
                  key={step.stepId}
                  className="border-b border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-hover)]"
                >
                  <td className="px-4 py-3 text-sm text-[color:var(--color-text-secondary)]">
                    {index}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-[color:var(--color-text-primary)]">
                    {step.label}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isFirst ? (
                      <span className="text-sm text-[color:var(--color-text-secondary)]">-</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm text-[color:var(--color-text-secondary)]">↓</span>
                        <span className={`text-sm font-medium ${conversionColor}`}>
                          {percentFormatter.format(step.conversionRate)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-[color:var(--color-text-primary)]">
                    {numberFormatter.format(step.reached)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[color:var(--color-text-secondary)]">
                    {isFirst ? '-' : numberFormatter.format(step.notReached)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[color:var(--color-text-secondary)]">
                    {percentFormatter.format(step.overallRate)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* 到達率バー */}
                      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${step.overallRate}%` }}
                        />
                      </div>
                      {/* 目標マーカー（仮で50%に設定） */}
                      {!isFirst && (
                        <div className="relative h-6 w-px">
                          <div
                            className="absolute top-0 h-full w-px bg-orange-400"
                            style={{ left: '50%' }}
                          />
                          <div
                            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-orange-400"
                            style={{ left: '50%' }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
