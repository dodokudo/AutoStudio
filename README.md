# AutoStudio (Threads MVP)

AutoStudio は Threads を皮切りに複数のマーケティング自動化ツールを束ねる Next.js 製ダッシュボードです。リポジトリ直下が Next.js アプリ本体になっており、今後のモジュール追加にも対応できる構成になっています。

## Getting Started

```bash
npm install
npm run dev
```

デフォルトページは `/threads` へリダイレクトし、仕様書 `docs/threads-mvp-spec.md` への導線やロードマップを確認できます。

## Project Structure

```
AutoStudio/
├── src/app/                   # App Router でセクションを管理
│   ├── (autostudio)/threads   # Threads 向け UI/ページ
│   ├── (autostudio)/instagram # Instagram 競合リサーチ & 台本表示
│   └── api/threads            # API Routes（生成・承認・ジョブ実行など）
├── src/lib/                   # BigQuery/Claude/Threads API ヘルパー
├── src/scripts/               # CLI から実行する ETL / ワーカー処理
├── src/types/                 # 共有型定義
├── public/                    # 静的アセット
├── docs/                      # プロダクト仕様・手順書
├── deploy/                    # Cloud Run / Scheduler 向けテンプレ
├── line-bot/                  # LSTEP 連携 LINE Bot（Cloud Functions）
├── .env.example               # 必須環境変数のサンプル
└── vercel.json                # Vercel 用ビルド設定
```

## Lstep 自動取得ツール（ツール4）

- 仕様と手順は `docs/lstep-mvp-spec.md` にまとめています。
- 初回 Cookie 保存: `npm run lstep:capture`
- 自動 ETL 実行: `npm run lstep:ingest`（ローカル確認用。Cloud Run では Scheduler で起動）
- Cloud Run デプロイテンプレ: `deploy/lstep/`
- 通知: エラー時メール送信（`LSTEP_ALERT_EMAILS` / `LSTEP_SMTP_*`）。再ログインは `npm run lstep:capture` で対応。
- `/line` ページで BigQuery から日次 KPI を表示。`LSTEP_FUNNEL_TAGS` でファネル段階を調整可能。

## Utilities

- `npm run sync:threads` — Google Sheets から BigQuery へ Threads・競合データを同期。
- `npm run prompt:preview` — BigQuery データを元に Claude へ渡す投稿生成ペイロードを作成。
- `npm run worker:threads` — `thread_post_jobs` を処理し、Threads 投稿＆ログ記録を実行。
- `npm run templates:update` — 投稿 72 時間後の実績からテンプレート評価を更新。
- `npm run lstep:*` — LSTEP 向けの BigQuery 初期化、Cookie 更新、ETL 実行コマンド群（`lstep:check` で事前検証、`lstep:capture` で Cookie 保存、`lstep:init`/`lstep:ingest` で取り込み実行）。
- `npm run ig:*` — Instagram ツール向けのジョブ（`ig:fetch` 競合リール取得、`ig:transcribe` 文字起こし、`ig:generate` 台本生成、`ig:notify` メール通知）。

## 必須環境変数（抜粋）

| 変数名 | 用途 |
| --- | --- |
| `THREADS_TOKEN` / `THREADS_ACCOUNT_ID` | Threads Graph API で投稿するための資格情報 |
| `THREADS_POSTING_ENABLED` | `false` でドライラン、`true` で実投稿を許可 |
| `CLAUDE_API_KEY` | Claude への投稿案生成リクエストに使用 |
| `CLAUDE_MODEL` (任意) | Claude モデル指定。既定は `claude-sonnet-4-20250514` |
| `BQ_PROJECT_ID` | BigQuery のプロジェクト ID (既定: `mark-454114`) |
| `ALERT_EMAIL_ENABLED` | `true` で失敗時メール通知を送信 |
| `ALERT_EMAIL_TO` / `ALERT_EMAIL_FROM` | 通知メールの宛先／送信元 |
| `ALERT_SMTP_HOST` / `ALERT_SMTP_PORT` / `ALERT_SMTP_USER` / `ALERT_SMTP_PASS` | SMTP 通知設定 |

仕様を変更した場合は `docs/threads-mvp-spec.md` を合わせて更新し、マーケティングと開発の認識を揃えてください。
