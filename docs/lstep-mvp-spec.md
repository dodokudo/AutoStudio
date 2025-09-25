# Lstep 自動取得ツール（AutoStudio ツール4）MVP仕様

このドキュメントは、Lstep 管理画面から友だちCSVを自動取得し BigQuery に格納、AutoStudio の LINE タブで可視化するまでの MVP 要件をまとめたものです。

## 全体像

```
Cloud Scheduler (01:00 JST)
   → Cloud Run (Node.js + Playwright)
      → Lstep CSV ダウンロード
      → Shift_JIS → UTF-8, 正規化（縦持ち化）
      → GCS raw/processed へ保存
      → BigQuery autostudio_lstep へロード
      → アラートメール送信（失敗 / Cookie失効）
→ AutoStudio (Next.js) で KPI クエリ
```

- **Cookie再利用**: 初回のみ `npm run lstep:capture` で Playwright が手動ログイン→Cookie を GCS に保存。Cloud Run 本番ジョブは同じストレージステートを再利用。失効時は通知し再取得。
- **データ保持方針**: `raw/` オブジェクトは GCS ライフサイクルで 7 日後に自動削除。BigQuery 取り込み後は `processed/` と BQ テーブルのみ保持。
- **リトライ**: ダウンロード／整形／ロードは指数バックオフ（5s→10s→30s、最大3リトライ）。
- **通知**: Cookie失効・ダウンロード失敗・整形失敗・BQロード失敗で アラートメール（複数宛先可）を送信。

## 環境変数

`.env.example` に主要なキーを追記しています。主なもの:

- `LSTEP_LOGIN_URL`, `LSTEP_FRIENDS_URL` — Lstep ログイン/友だち一覧URL。
- `LSTEP_GCS_BUCKET`, `LSTEP_STORAGE_STATE_OBJECT` — Cookie保存先とオブジェクトキー。
- `LSTEP_BQ_*` — BigQuery プロジェクト・データセット・ロケーション。
- `LSTEP_RAW_PREFIX`, `LSTEP_PROCESSED_PREFIX` — GCS 配下のプレフィックス。
- `LSTEP_ALERT_EMAILS` — 通知先メールアドレス（カンマ区切り）。
- `LSTEP_EMAIL_FROM` / `LSTEP_EMAIL_SUBJECT_PREFIX` — 送信元アドレスと件名プレフィックス。
- `LSTEP_SMTP_*` — SMTP 接続情報（Gmail を使う場合はアプリパスワードを利用）。
- `LSTEP_RETRY_DELAYS_MS`, `LSTEP_DOWNLOAD_TIMEOUT_MS` — リトライ/タイムアウト設定。
- `LSTEP_FUNNEL_TAGS` — AutoStudio のファネル表示で使用するタグ名（`|` 区切り）。既定は `IG×LN：流入|IG×LN：詳細F済|IG×LN：成約`。

## 手動セットアップ手順

1. `.env.local` に必要な Lstep / GCP / メール(SMTP) の情報を記入。
2. `npm install` を実行して依存ライブラリ（Playwright 等）を取得。
3. `npm run lstep:check` を実行し、GCS バケット / Cookie ストレージ / BigQuery 権限に問題がないかを確認。
4. `npm run lstep:capture` を実行し、開いたブラウザで reCAPTCHA を含めてログイン。ログイン完了後 Enter を押すと Cookie が `gs://<bucket>/<storage_state_object>` に保存される。
5. GCS バケットに対し、`raw/` プレフィックスへ 7 日 TTL のオブジェクトライフサイクルを設定。
6. Cloud Run サービスをデプロイし、環境変数を設定（下記「デプロイ手順」参照）。Cloud Scheduler（01:00 JST）からサービスを起動。

## デプロイ手順（Cloud Run）

- `deploy/lstep/Dockerfile` — Playwright 付き Node コンテナ。`npm run lstep:ingest` をエントリーポイントに設定。
- `deploy/lstep/cloudbuild.yaml` — Cloud Build 用テンプレート（`web/` ディレクトリで `gcloud builds submit` する想定）。`_IMAGE_URI`・`_SERVICE_NAME` などの substitution を自プロジェクト用に修正し、`gcloud builds submit --config deploy/lstep/cloudbuild.yaml --substitutions ...` でビルド＆デプロイできます。
  - `--set-secrets` は Secret Manager に保存した SMTP 認証情報（例: Gmail アプリパスワード）を参照する想定です。
- Cloud Run 実行サービスには `Storage Object Admin` + `BigQuery Data Editor` 権限を持つ専用サービスアカウントを割り当て（Workload Identity 想定で鍵ファイル不要）。

### SMTP / Gmail 設定メモ

- Gmail を利用する場合はアカウントに2段階認証を有効化し、アプリパスワードを発行して `LSTEP_SMTP_PASS` に設定します。
- `LSTEP_SMTP_HOST=smtp.gmail.com`、`LSTEP_SMTP_PORT=465`、`LSTEP_SMTP_SECURE=true` が推奨設定です。
- 送信元 (`LSTEP_EMAIL_FROM`) は Gmail のアドレスに合わせるか、`"名前" <アドレス>` 形式で指定します。

### Cloud Scheduler

- サンプル構成: `deploy/lstep/scheduler-job.yaml`
  - `REGION` / `PROJECT_ID` / サービス名を環境に合わせて変更。
  - `scheduler-invoker@...` は Cloud Run Invoker 権限を付与した専用SAを想定。
  - デフォルト cron は 01:00 JST（`0 1 * * *`）。必要に応じて変更。
- デプロイ例:

```bash
gcloud scheduler jobs create http autostudio-lstep-daily \
  --schedule='0 1 * * *' \
  --time-zone='Asia/Tokyo' \
  --uri='https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/services/autostudio-lstep:run' \
  --http-method=POST \
  --oauth-service-account-email=scheduler-invoker@PROJECT_ID.iam.gserviceaccount.com
```

## スキーマ

データセット `autostudio_lstep`（デフォルト）は以下4テーブルを持つ:

| テーブル | 主キー | パーティション | クラスタリング |
| --- | --- | --- | --- |
| `user_core` | `user_id` | `snapshot_date` | `user_id` |
| `user_tags` | (`user_id`, `tag_name`) | `snapshot_date` | `user_id`, `tag_name` |
| `user_sources` | (`user_id`, `source_name`) | `snapshot_date` | `user_id`, `source_name` |
| `user_surveys` | (`user_id`, `question`) | `snapshot_date` | `user_id`, `question` |

値はすべて縦持ちに正規化され、新しいタグ・ファネル・流入経路が追加されてもスキーマ変更不要。

## KPI クエリ例

1. 日次新規友だち数
2. タグ別ユーザー数 TOP10
3. 流入経路別ユーザー数
4. 簡易ファネル（流入→詳細F済→成約）

AutoStudio の LINE タブ（`/line`）では上記メトリクスを BigQuery から直接取得してカード表示しています。必要に応じて `LSTEP_FUNNEL_TAGS` を変更し、追加の指標やカードを拡張してください。

詳細な SQL は開発メモ（前回共有）または `runLstepIngestion` 実装周辺を参照。

## 運用チェックリスト

- Cloud Run ログでダウンロード手順が完了し、BigQuery ロードジョブが成功しているか確認。
- `raw/` と `processed/` 配下に日付ディレクトリが生成されているか確認。
- アラートメールがエラー時のみ送信されることをテスト（通知を受け取ったら、本ドキュメントの再ログイン手順に従いユーザー本人が対処）。
- AutoStudio 側で BigQuery 接続設定（Service Account）と KPI クエリの準備。
- 定期的に `npm run lstep:check` を実行し、権限や Cookie 有効期限の有無を確認。

## 今後の拡張ポイント

- Playwright フローのスクリーンショット保存やUI変更検知。
- 成功ジョブの軽量メトリクス蓄積（Logging → Monitoring）。
- AutoStudio 内タブナビゲーションを Threads/YouTube/Instagram と共通化。
- BigQuery でのマテビューや Looker Studio 連携。
