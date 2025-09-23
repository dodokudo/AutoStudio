import Link from 'next/link';
import { getLatestPrompt, listPromptVersions } from '@/lib/promptSettings';
import { PromptEditor } from './prompt-editor';

export default async function PromptSettingsPage() {
  const latest = await getLatestPrompt();
  const versions = await listPromptVersions(10);
  return (
    <div className="space-y-6 text-sm text-slate-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">プロンプト設定</h1>
          <p className="mt-1 text-xs text-slate-400">
            Claude に渡す基準プロンプトを編集できます。保存すると投稿生成に即反映されます。
          </p>
        </div>
        <Link
          href="/threads"
          className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800"
        >
          ← 投稿管理へ戻る
        </Link>
      </div>

      <PromptEditor latest={latest} versions={versions} />
    </div>
  );
}
