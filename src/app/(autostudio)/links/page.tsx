import { LinksList } from './_components/links-list';
import { CreateLinkForm } from './_components/create-link-form';

export const dynamic = 'force-dynamic';

export default function LinksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンク管理</h1>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
          カスタムOGP設定付きの短縮リンクを作成・管理
        </p>
      </div>

      <CreateLinkForm />

      <LinksList />
    </div>
  );
}
