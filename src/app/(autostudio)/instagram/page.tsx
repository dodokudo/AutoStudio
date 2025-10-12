import { ensureInstagramTables } from '@/lib/instagram/bigquery';
import { createInstagramBigQuery, loadInstagramConfig } from '@/lib/instagram';
import { getInstagramDashboardData } from '@/lib/instagram/dashboard';
import { InstagramDashboardView } from './_components/dashboard-view.client';
import { Banner } from '@/components/ui/banner';

export const dynamic = 'force-dynamic';

export default async function InstagramDashboardPage() {
  try {
    const config = loadInstagramConfig();
    const bigquery = createInstagramBigQuery();
    await ensureInstagramTables(bigquery);
    const data = await getInstagramDashboardData(config.projectId);

    return <InstagramDashboardView data={data} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">環境変数が不足しています</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            `.env.local` に Instagram 関連の環境変数を設定した後、ページを再読み込みしてください。
          </p>
        </Banner>
      </div>
    );
  }
}
