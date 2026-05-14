import { getReelMetricsDashboardData } from '@/lib/instagram/reelMetricsDashboard';
import { LiveReelsView } from './_components/live-reels-view';
import { Banner } from '@/components/ui/banner';

export const dynamic = 'force-dynamic';

export default async function LiveReelsPage() {
  try {
    const data = await getReelMetricsDashboardData();
    return <LiveReelsView data={data} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack p-6">
        <Banner variant="error">
          <p className="font-semibold">Graph APIメトリクスの読み込みに失敗しました</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            `npm run ig:metrics` で BigQuery にデータが投入されているか確認してください。
          </p>
        </Banner>
      </div>
    );
  }
}
