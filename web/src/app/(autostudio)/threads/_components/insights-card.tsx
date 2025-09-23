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
}

const toneClassMap: Record<NonNullable<InsightStat['deltaTone']>, string> = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  neutral: 'text-slate-300',
};

export function InsightsCard({ title, stats, note }: InsightsCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {note ? <span className="text-xs text-slate-400">{note}</span> : null}
      </header>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{stat.label}</dt>
            <dd className="mt-2 text-2xl font-semibold text-white">{stat.value}</dd>
            {stat.delta ? (
              <p className={`mt-1 text-xs ${stat.deltaTone ? toneClassMap[stat.deltaTone] : 'text-slate-300'}`}>
                {stat.delta}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
