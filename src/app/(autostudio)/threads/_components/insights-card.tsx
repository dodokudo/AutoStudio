import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface InsightStat {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
}

interface InsightsCardProps {
  title: string;
  stats: InsightStat[];
  note?: string;
  actions?: ReactNode;
}

const toneTextClass: Record<NonNullable<InsightStat['deltaTone']>, string> = {
  up: 'text-[#137a4c]',
  down: 'text-[#b42318]',
  neutral: 'text-[color:var(--color-text-muted)]',
};

const toneBadgeClass: Record<NonNullable<InsightStat['deltaTone']>, string> = {
  up: 'bg-[#e6f7ed] text-[#096c3e]',
  down: 'bg-[#fdeded] text-[#a61b1b]',
  neutral: 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]',
};

export function InsightsCard({ title, stats, note, actions }: InsightsCardProps) {
  return (
    <Card>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{title}</h2>
          {note ? <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{note}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">{actions}</div> : null}
      </header>

      <dl className="mt-6 grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5">
            <dt className="text-xs font-medium text-[color:var(--color-text-secondary)] uppercase tracking-[0.08em]">
              {stat.label}
            </dt>
            <dd className="mt-4 text-[2rem] font-semibold leading-none text-[color:var(--color-text-primary)]">
              {stat.value}
            </dd>
            {stat.delta ? (
              <p
                className={classNames(
                  'mt-3 text-xs font-medium',
                  stat.deltaTone ? toneTextClass[stat.deltaTone] : 'text-[color:var(--color-text-muted)]',
                )}
              >
                {stat.delta}
              </p>
            ) : null}
            {stat.deltaTone ? (
              <span
                className={classNames(
                  'mt-3 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium',
                  toneBadgeClass[stat.deltaTone],
                )}
              >
                {stat.deltaTone === 'up' ? '増加傾向' : stat.deltaTone === 'down' ? '減少傾向' : '横ばい'}
              </span>
            ) : null}
          </div>
        ))}
      </dl>
    </Card>
  );
}
