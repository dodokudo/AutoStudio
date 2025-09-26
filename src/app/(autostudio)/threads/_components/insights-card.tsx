import type { ReactNode } from "react";

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

const toneClassMap: Record<NonNullable<InsightStat['deltaTone']>, string> = {
  up: 'text-emerald-500',
  down: 'text-rose-500',
  neutral: 'text-slate-400',
};

const indicatorBackground: Record<NonNullable<InsightStat['deltaTone']>, string> = {
  up: 'bg-emerald-100/80 text-emerald-600',
  down: 'bg-rose-100/80 text-rose-600',
  neutral: 'bg-slate-100/80 text-slate-500',
};

export function InsightsCard({ title, stats, note, actions }: InsightsCardProps) {
  return (
    <section className="card-strong rounded-[32px] p-8 backdrop-blur-xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-400">Threads Pulse</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {note ? <span className="text-xs text-slate-500 dark:text-slate-300">{note}</span> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
          {actions ?? null}
          <span className="hidden items-center gap-1 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 shadow-sm dark:border-white/10 dark:bg-white/10 lg:inline-flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            リアルタイム更新
          </span>
        </div>
      </header>
      <dl className="stat-grid">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-3xl bg-white/90 p-6 shadow-[0_22px_45px_rgba(84,110,192,0.16)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_28px_55px_rgba(82,94,170,0.22)] dark:bg-white/10"
          >
            <div
              className="pointer-events-none absolute inset-x-4 top-2 h-[6px] rounded-full"
              style={{
                background:
                  'linear-gradient(120deg, rgba(79,140,255,0.3), rgba(111,126,252,0.35), rgba(16,185,129,0.25))',
              }}
            />
            <div className="flex items-center justify-between">
              <dt className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                {stat.label}
              </dt>
              {stat.deltaTone ? (
                <span className={`mt-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${indicatorBackground[stat.deltaTone]}`}>
                  {stat.deltaTone === 'up' ? '↗' : stat.deltaTone === 'down' ? '↘' : '→'} trend
                </span>
              ) : null}
            </div>
            <dd className="mt-5 text-[2.1rem] font-semibold leading-none text-slate-900 dark:text-white">{stat.value}</dd>
            {stat.delta ? (
              <p className={`mt-2 text-xs font-medium ${stat.deltaTone ? toneClassMap[stat.deltaTone] : 'text-slate-400'}`}>
                {stat.delta}
              </p>
            ) : null}
            <div className="mt-4 h-10 w-full overflow-hidden rounded-full bg-gradient-to-r from-indigo-100/40 via-white to-indigo-50/40">
              <div className="h-full w-full bg-[length:160%_100%] bg-[position:0%_0%] bg-[image:radial-gradient(circle_at_8%_50%,rgba(91,124,255,0.35),transparent_45%),radial-gradient(circle_at_35%_35%,rgba(108,221,222,0.25),transparent_40%),radial-gradient(circle_at_70%_60%,rgba(16,185,129,0.32),transparent_45%)] transition-[background-position] duration-700 group-hover:bg-[position:100%_0%]" />
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
