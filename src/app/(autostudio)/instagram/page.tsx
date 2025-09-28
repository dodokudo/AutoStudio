import { ensureInstagramTables } from '@/lib/instagram/bigquery';
import { createInstagramBigQuery, loadInstagramConfig } from '@/lib/instagram';
import { getInstagramDashboardData } from '@/lib/instagram/dashboard';
import { upsertUserCompetitor, deactivateUserCompetitor } from '@/lib/instagram/competitors';
import { InstagramDashboardView } from './_components/dashboard-view';
import { CompetitorManager } from './_components/competitor-manager';
import { revalidatePath } from 'next/cache';
import { Card } from '@/components/ui/card';
import { Banner } from '@/components/ui/banner';

export const dynamic = 'force-dynamic';

export default async function InstagramDashboardPage() {
  try {
    const config = loadInstagramConfig();
    const bigquery = createInstagramBigQuery();
    await ensureInstagramTables(bigquery);
    const data = await getInstagramDashboardData(config.projectId);

    async function addCompetitor(formData: FormData) {
      'use server';
      const username = String(formData.get('username') ?? '').trim();
      if (!username) {
        throw new Error('username is required');
      }

      const driveFolderId = String(formData.get('driveFolderId') ?? '').trim() || undefined;
      const category = String(formData.get('category') ?? '').trim() || undefined;
      const priorityValue = formData.get('priority');
      const priority = priorityValue ? Number(priorityValue) : undefined;

      await upsertUserCompetitor(config.defaultUserId, {
        username,
        driveFolderId,
        category,
        priority: Number.isFinite(priority) ? (priority as number) : undefined,
      });
      revalidatePath('/instagram');
    }

    async function removeCompetitor(formData: FormData) {
      'use server';
      const username = String(formData.get('username') ?? '').trim();
      if (!username) {
        return;
      }
      await deactivateUserCompetitor(config.defaultUserId, username);
      revalidatePath('/instagram');
    }

    return (
      <div className="section-stack">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">Instagram ダッシュボード</h1>
          <p className="text-sm text-[color:var(--color-text-secondary)]">競合リールの動向と自社インサイト、生成された台本案をまとめて確認できます。</p>
        </header>
        <InstagramDashboardView data={data} />
        <CompetitorManager competitors={data.userCompetitors} addAction={addCompetitor} removeAction={removeCompetitor} />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <Card>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">Instagram ダッシュボード</h1>
          <Banner variant="error" className="mt-4">
            <p className="font-semibold">環境変数が不足しています</p>
            <p className="mt-1 text-sm">{message}</p>
            <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">`.env.local` に Instagram 関連の環境変数を設定した後、ページを再読み込みしてください。</p>
          </Banner>
        </Card>
      </div>
    );
  }
}
