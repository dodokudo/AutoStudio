import Link from 'next/link';
import { getLatestPrompt, listPromptVersions } from '@/lib/promptSettings';
import { PromptEditor } from './prompt-editor';

export const revalidate = 1800;

export default async function PromptSettingsPage() {
  try {
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
  } catch (error) {
    console.error('[threads/prompt/page] Error:', error);
    return (
      <div className="space-y-6 text-sm text-slate-300 p-8">
        <h1 className="text-2xl font-semibold text-white">プロンプト設定</h1>
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
            <details className="mt-2">
              <summary className="cursor-pointer">詳細情報</summary>
              <pre className="mt-2 text-xs overflow-auto">
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
