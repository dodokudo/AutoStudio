import { AdsDashboardShell } from './_components/AdsDashboardShell';

const RANGE_OPTIONS = [
  { value: '7d', label: '7日間' },
  { value: '14d', label: '14日間' },
  { value: '30d', label: '30日間' },
];

export const dynamic = 'force-dynamic';

export default async function AdsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const selectedRange = RANGE_OPTIONS.find((opt) => opt.value === rangeParam)?.value ?? RANGE_OPTIONS[0].value;

  // 仮の期間データ
  const today = new Date();
  const period = {
    start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };

  return (
    <div className="section-stack">
      <AdsDashboardShell rangeOptions={RANGE_OPTIONS} selectedRange={selectedRange} period={period} />
    </div>
  );
}
