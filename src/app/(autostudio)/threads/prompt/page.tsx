import { Card } from '@/components/ui/card';
import { KUDO_MASTER_PROMPT } from '@/lib/claude';
import { getLatestPrompt, listPromptVersions, type ThreadsPromptType } from '@/lib/promptSettings';
import { THREADS_OPERATION_PROMPT } from '@/lib/threadsOperationPrompt';
import { ThreadsTabShell, type ThreadsTabKey } from '../_components/threads-tab-shell';
import { PromptEditor, type PromptEditorEntry } from './prompt-editor';

export const dynamic = 'force-dynamic';

const TAB_ITEMS: Array<{ id: ThreadsTabKey; label: string; href: string }> = [
  { id: 'insights', label: 'インサイト', href: '/threads?range=7d&account=all&tab=insights' },
  { id: 'schedule', label: '予約投稿', href: '/threads?range=7d&account=all&tab=schedule' },
  { id: 'post', label: '投稿', href: '/threads?range=7d&account=all&tab=post' },
  { id: 'competitor', label: '競合インサイト', href: '/threads?range=7d&account=all&tab=competitor' },
  { id: 'report', label: 'レポート', href: '/threads?range=7d&account=all&tab=report' },
  { id: 'prompt', label: 'プロンプト', href: '/threads/prompt' },
];

const PROMPT_CONFIG: Record<ThreadsPromptType, Omit<PromptEditorEntry, 'initialText' | 'latest' | 'versions'>> = {
  'ai-tips': {
    type: 'ai-tips',
    label: 'AI活用系',
    description: 'AI活用ノウハウの投稿を生成する基準プロンプトです。',
    codeLocation: 'src/lib/claude.ts / KUDO_MASTER_PROMPT',
    usedBy: 'AI活用系の一括生成・個別生成',
  },
  'threads-operation': {
    type: 'threads-operation',
    label: 'Threads運用系',
    description: 'Threads運用ノウハウの投稿を生成する基準プロンプトです。',
    codeLocation: 'src/lib/threadsOperationPrompt.ts / THREADS_OPERATION_PROMPT',
    usedBy: 'Threads運用系の一括生成・個別生成・予約投稿生成',
  },
};

export default async function PromptSettingsPage() {
  try {
    const [aiLatest, aiVersions, operationLatest, operationVersions] = await Promise.all([
      getLatestPrompt('ai-tips'),
      listPromptVersions('ai-tips', 10),
      getLatestPrompt('threads-operation'),
      listPromptVersions('threads-operation', 10),
    ]);

    const entries: PromptEditorEntry[] = [
      {
        ...PROMPT_CONFIG['ai-tips'],
        initialText: aiLatest?.prompt_text || KUDO_MASTER_PROMPT,
        latest: aiLatest,
        versions: aiVersions,
      },
      {
        ...PROMPT_CONFIG['threads-operation'],
        initialText: operationLatest?.prompt_text || THREADS_OPERATION_PROMPT,
        latest: operationLatest,
        versions: operationVersions,
      },
    ];

    return (
      <ThreadsTabShell tabItems={TAB_ITEMS} activeTab="prompt">
        <div className="section-stack">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">プロンプト設定</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              投稿生成で実際に使われる2種類のプロンプトを確認・編集できます。
            </p>
          </Card>
          <PromptEditor entries={entries} />
        </div>
      </ThreadsTabShell>
    );
  } catch (error) {
    console.error('[threads/prompt/page] Error:', error);
    return (
      <ThreadsTabShell tabItems={TAB_ITEMS} activeTab="prompt">
        <div className="section-stack">
          <Card className="p-6">
            <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">プロンプト設定</h1>
            <div className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              プロンプトの読み込みに失敗しました。再読み込みしても直らない場合は、BigQuery接続を確認してください。
              <details className="mt-2">
                <summary className="cursor-pointer">詳細情報</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                  {error instanceof Error ? error.message : String(error)}
                </pre>
              </details>
            </div>
          </Card>
        </div>
      </ThreadsTabShell>
    );
  }
}
