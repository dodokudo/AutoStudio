import { EditLinkForm } from './_components/edit-link-form';

interface EditLinkPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditLinkPage({ params }: EditLinkPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンク編集</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          短縮リンクの情報を編集できます
        </p>
      </div>

      <EditLinkForm linkId={id} />
    </div>
  );
}
