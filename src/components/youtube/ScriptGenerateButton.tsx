'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import {
  DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID,
  getYoutubeScriptTemplate,
  YOUTUBE_SCRIPT_TEMPLATES,
  type YoutubeScriptTemplateId,
} from '@/lib/youtube/scriptTemplates';

interface ScriptGenerateButtonProps {
  themeKeyword: string;
  expanded?: boolean;
  representativeVideo?: {
    videoId: string;
    title: string;
    channelTitle?: string;
    channelId: string;
    viewCount?: number;
    viewVelocity?: number;
    engagementRate?: number;
  };
}

interface GenerateResult {
  videoTitle: string;
  notionPageId?: string;
  templateLabel?: string;
}

const fieldClassName =
  'w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent)]/15';

export function ScriptGenerateButton({
  themeKeyword: initialThemeKeyword,
  expanded = false,
  representativeVideo,
}: ScriptGenerateButtonProps) {
  const router = useRouter();
  const initialTemplate = getYoutubeScriptTemplate(DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID);
  const [themeKeyword, setThemeKeyword] = useState(initialThemeKeyword);
  const [templateId, setTemplateId] = useState<YoutubeScriptTemplateId>(DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID);
  const [durationMinutes, setDurationMinutes] = useState(initialTemplate.defaultDurationMinutes);
  const [targetPersona, setTargetPersona] = useState(
    expanded ? 'Threadsをこれから伸ばしたい個人事業主・経営者' : 'AI活用に関心のあるビジネスパーソン',
  );
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GenerateResult | null>(null);

  const selectedTemplate = useMemo(() => getYoutubeScriptTemplate(templateId), [templateId]);

  const selectTemplate = (nextTemplateId: YoutubeScriptTemplateId) => {
    const nextTemplate = getYoutubeScriptTemplate(nextTemplateId);
    setTemplateId(nextTemplateId);
    setDurationMinutes(nextTemplate.defaultDurationMinutes);
  };

  const handleGenerate = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalizedTheme = themeKeyword.trim();
    if (!normalizedTheme) {
      setMessage('動画テーマを入力してください。');
      return;
    }

    setIsGenerating(true);
    setMessage(null);
    setGenerated(null);

    const referenceNote = representativeVideo
      ? `主な参考動画: https://youtube.com/watch?v=${representativeVideo.videoId}`
      : undefined;

    try {
      const response = await fetch('/api/youtube/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeKeyword: normalizedTheme,
          templateId,
          durationMinutes,
          targetPersona: targetPersona.trim() || undefined,
          evidenceNotes: evidenceNotes.trim() || undefined,
          notes: [notes.trim(), referenceNote].filter(Boolean).join('\n') || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setGenerated({
          videoTitle: data.videoTitle,
          notionPageId: data.notionPageId,
          templateLabel: data.templateLabel,
        });
        setMessage('構造化台本を生成し、Notionに保存しました。');
        router.refresh();
      } else {
        setMessage(`エラー: ${data.error ?? '未知のエラー'}`);
      }
    } catch (error) {
      setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!expanded) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="ui-button-primary h-8 px-3 text-xs"
        >
          {isGenerating ? '台本生成中...' : '台本生成'}
        </button>
        {message ? <p className="text-[11px] text-[color:var(--color-text-muted)]">{message}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleGenerate} className="mt-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">1. 台本の型を選ぶ</h3>
            <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
              Threads競合台本で確認した主構成を、用途別の8テンプレートに整理しています。
            </p>
          </div>
          <p className="text-xs text-[color:var(--color-text-muted)]">推奨尺: 約{selectedTemplate.defaultDurationMinutes}分</p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {YOUTUBE_SCRIPT_TEMPLATES.map((template) => {
            const selected = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectTemplate(template.id)}
                className={`rounded-[var(--radius-md)] border p-3 text-left transition ${
                  selected
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 ring-1 ring-[color:var(--color-accent)]/20'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] hover:border-[color:var(--color-accent)]/50'
                }`}
              >
                <span className="block text-sm font-semibold text-[color:var(--color-text-primary)]">{template.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[color:var(--color-text-secondary)]">{template.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{selectedTemplate.label}の章構造</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">向いている企画: {selectedTemplate.bestFor}</p>
          </div>
          <span className="rounded-full bg-[color:var(--color-surface)] px-2.5 py-1 text-xs text-[color:var(--color-text-muted)]">
            {selectedTemplate.sections.length}章
          </span>
        </div>
        <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {selectedTemplate.sections.map((section, index) => (
            <li key={section.id} className="flex gap-2 text-xs leading-5 text-[color:var(--color-text-secondary)]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface)] font-semibold text-[color:var(--color-accent)]">
                {index + 1}
              </span>
              <span>
                <strong className="font-medium text-[color:var(--color-text-primary)]">{section.label}</strong>
                <span className="block">{section.purpose}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">2. 企画の条件を入れる</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            動画テーマ <span className="text-[color:var(--color-accent)]">必須</span>
            <input
              required
              value={themeKeyword}
              onChange={(event) => setThemeKeyword(event.target.value)}
              placeholder="例: Threadsを0から1000フォロワーまで伸ばす方法"
              className={`${fieldClassName} mt-1.5`}
            />
          </label>

          <label className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            想定視聴者
            <input
              value={targetPersona}
              onChange={(event) => setTargetPersona(event.target.value)}
              placeholder="例: 発信経験はあるがThreadsは初心者"
              className={`${fieldClassName} mt-1.5`}
            />
          </label>

          <label className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            目標尺
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className={`${fieldClassName} mt-1.5`}
            >
              {[15, 20, 25, 30, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  約{minutes}分
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-[color:var(--color-text-secondary)] md:row-span-2">
            使える実績・証拠
            <textarea
              value={evidenceNotes}
              onChange={(event) => setEvidenceNotes(event.target.value)}
              placeholder="例: 30日で0→1,120フォロワー。初日と30日目の管理画面キャプチャあり。売上は非公開。"
              rows={5}
              className={`${fieldClassName} mt-1.5 resize-y`}
            />
            <span className="mt-1 block font-normal text-[color:var(--color-text-muted)]">
              空欄の場合、AIは実績を創作せず「要確認」として出力します。
            </span>
          </label>

          <label className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            追加指示
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="例: スマホ画面の実演を多めに。月100万円の話は今回は含めない。"
              rows={3}
              className={`${fieldClassName} mt-1.5 resize-y`}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-5">
        <p className="max-w-2xl text-xs leading-5 text-[color:var(--color-text-muted)]">
          生成結果には、完成原稿に加えて章ごとの目的、目安尺、画面・テロップ指示、必要な証拠素材が含まれます。
        </p>
        <button type="submit" disabled={isGenerating} className="ui-button-primary min-w-40 px-4 py-2 text-sm">
          {isGenerating ? '構造化台本を生成中...' : 'この構成で台本を生成'}
        </button>
      </div>

      <div aria-live="polite">
        {message ? (
          <p className={`text-sm ${message.startsWith('エラー') ? 'text-red-500' : 'text-[color:var(--color-text-secondary)]'}`}>
            {message}
          </p>
        ) : null}
        {generated ? (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
            <p className="text-xs text-[color:var(--color-text-muted)]">{generated.templateLabel}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--color-text-primary)]">{generated.videoTitle}</p>
            {generated.notionPageId ? (
              <a
                href={`https://www.notion.so/${generated.notionPageId.replace(/-/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-medium text-[color:var(--color-accent)] hover:underline"
              >
                Notionで台本を開く
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
