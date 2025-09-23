# AutoStudio (Threads MVP)

This repository hosts the AutoStudio web dashboard built with Next.js (App Router + TypeScript + Tailwind). The initial milestone focuses on the Threads automation tool that will later live alongside YouTube and Instagram modules.

## Getting Started

```bash
npm install
npm run dev
```

The default page redirects to `/threads`, which contains roadmap notes and links to the detailed specification in `docs/threads-mvp-spec.md`.

## Project Structure (initial)

```
web/
├── docs/threads-mvp-spec.md     # Single source of truth for Threads MVP
├── src/app/
│   ├── (autostudio)/layout.tsx  # Shell with future tab navigation
│   ├── (autostudio)/threads/... # Threads-specific pages
│   ├── api/threads/...          # Placeholder API routes (501)
│   └── page.tsx                 # Redirects to /threads
├── src/lib/env.ts               # Environment variable guard
├── src/types/threads.ts         # Shared TypeScript types
└── .env.example                 # Required secrets
```

## Next Steps

1. Implement data sync from Google Sheets into BigQuery tables.
2. Connect Claude/Gemini for content generation following the documented prompt schema.
3. Build the approval UI (insights → competitor highlights → post queue).
4. Wire up publishing jobs to Threads API and log results for template evaluation.

## Utilities

- `npm run sync:threads` — Google Sheets → BigQuery 同期スクリプト。Threads本体と競合リサーチ
  シート（全投稿・対象者リスト）から `threads_*` / `competitor_posts_raw` / `competitor_account_daily`
  に書き込みます。実行前に `.env.local` の `GOOGLE_APPLICATION_CREDENTIALS` とシート共有を設定してください。
- `npm run prompt:preview` — BigQuery から最新データを取得し、Claude 向け投稿生成ペイロード
  （JSON）を生成・標準出力に表示します。
- `npm run worker:threads` — BigQuery にキューされた `thread_post_jobs` を処理し、投稿成功/失敗を
  `thread_posting_logs` に記録します（現在はThreads APIのダミー処理）。
- `npm run templates:update` — 投稿後72時間経過した成功ログを元に、テンプレートの平均インプレッション/いいねを
  `threads_prompt_template_scores` へ記録します。
- `/threads` ページの下部に軽量ダッシュボードを表示し、ジョブキューの状態と直近ログを可視化しています。
- `POST /api/threads/generate` — Claude API を使って当日の投稿案を自動生成し、`thread_post_plans` を更新します。
- `POST /api/threads/cron/run` — ワーカー実行とテンプレ評価更新をまとめてキックするCron用エンドポイント。

## 必要な環境変数（抜粋）

| 変数名 | 用途 |
| --- | --- |
| `THREADS_TOKEN` / `THREADS_ACCOUNT_ID` | Threads Graph API での投稿に使用 |
| `CLAUDE_API_KEY` | Claude への投稿案生成リクエストに使用 |
| `CLAUDE_MODEL` (任意) | Claude モデル指定。既定は `claude-3-5-sonnet-20240620` |
| `BQ_PROJECT_ID` | BigQuery のプロジェクト ID (既定: `mark-454114`) |

Please keep the documentation (`docs/threads-mvp-spec.md`) in sync with implementation changes so marketing and engineering share the same mental model.
