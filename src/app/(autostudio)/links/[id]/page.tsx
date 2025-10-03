import { LinkStatsView } from '../_components/link-stats-view';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function LinkStatsPage({ params }: PageProps) {
  const { id } = await params;

  return <LinkStatsView linkId={id} />;
}
