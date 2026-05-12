import { notFound } from 'next/navigation';
import { getLP } from '@/lib/launchkit/bigquery';
import { LaunchkitLPForm } from '../_components/launchkit-lp-form';
import { TrackingSnippet } from '../_components/tracking-snippet';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLaunchkitLPPage({ params }: PageProps) {
  const { id } = await params;
  const lp = await getLP(id);
  if (!lp) return notFound();

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">LP編集: {lp.name}</h1>
        <p className="text-xs text-gray-500">ID: {lp.id}</p>
      </header>

      <LaunchkitLPForm mode="edit" lp={lp} />

      <TrackingSnippet lpId={lp.id} />
    </div>
  );
}
