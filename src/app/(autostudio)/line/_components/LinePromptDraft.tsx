'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DRAFT_PROMPT = `# 役割
あなたは工藤さんのLINE配信を作成するマーケティングライターです。

# 目的
読者との信頼を保ちながら、配信ごとに設定された1つの目的へ自然に導いてください。

# 入力として受け取る情報
- 配信目的
- 配信対象
- 今回伝えたい内容・元ネタ
- CTA文言とURL
- 配信予定日時

# 出力形式
- プッシュ通知テキスト
- メッセージ1
- メッセージ2
- 必要な場合のみメッセージ3

# 執筆ルール
- 1配信1メッセージを徹底する
- 冒頭で読者が自分事にできる問いや状況を示す
- 誇張、架空の実績、根拠のない断定を使わない
- CTAは本文の流れから自然につなげる
- 読みやすい長さと改行にする
- LINE上で違和感のない自然な話し言葉を使う`;

export function LinePromptDraft() {
  const [prompt, setPrompt] = useState(DRAFT_PROMPT);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">LINE配信プロンプト</h1>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">UI下書き</span>
            </div>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              LINE配信の文章生成だけに使用する、Threadsとは独立したプロンプト画面案です。
            </p>
          </div>
          <div className="text-right text-xs text-[color:var(--color-text-muted)]">
            <p>コード・生成API未接続</p>
            <p className="mt-1">変更履歴なし</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">プロンプト本文</h2>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">将来は保存内容を「配信作成」のAI生成で使用します。</p>
            </div>
            <span className="rounded-full bg-[color:var(--color-surface-muted)] px-2.5 py-1 text-xs text-[color:var(--color-text-secondary)]">
              LINE配信専用
            </span>
          </div>
          <textarea
            className="mt-4 min-h-[620px] w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 font-mono text-sm leading-6 text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-blue-100"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            spellCheck={false}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled>変更を保存</Button>
            <Button variant="secondary" onClick={() => setPrompt(DRAFT_PROMPT)} disabled={prompt === DRAFT_PROMPT}>
              初期案に戻す
            </Button>
            <span className="text-xs text-[color:var(--color-text-muted)]">保存機能は未接続です。</span>
          </div>
        </Card>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">使用予定</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-[color:var(--color-text-muted)]">対象画面</dt>
                <dd className="mt-1 text-[color:var(--color-text-primary)]">LINE ＞ 配信作成</dd>
              </div>
              <div>
                <dt className="text-xs text-[color:var(--color-text-muted)]">生成する内容</dt>
                <dd className="mt-1 text-[color:var(--color-text-primary)]">通知文・本文・CTA</dd>
              </div>
              <div>
                <dt className="text-xs text-[color:var(--color-text-muted)]">保存先</dt>
                <dd className="mt-1 text-[color:var(--color-text-primary)]">専用プロンプト設定（予定）</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">接続予定の流れ</h2>
            <ol className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
              {['材料を入力', 'AIで配信文を生成', 'プレビューで修正', 'AutoStudioへ下書き保存', '確認後にLステップへ登録'].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-[color:var(--color-accent)]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
