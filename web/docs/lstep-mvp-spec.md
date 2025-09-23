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
      → LINE Notify (失敗 / Cookie失効)
→ AutoStudio (Next.js) で KPI クエリ
```

- **Cookie再利用**: 初回のみ `npm run lstep:capture` で Playwright が手動ログイン→Cookie を GCS に保存。Cloud Run 本番ジョブは同じストレージステートを再利用。失効時は通知し再取得。
- **データ保持方針**: `raw/` オブジェクトは GCS ライフサイクルで 7 日後に自動削除。BigQuery 取り込み後は `processed/` と BQ テーブルのみ保持。
- **リトライ**: ダウンロード／整形／ロードは指数バックオフ（5s→10s→30s、最大3リトライ）。
- **通知**: Cookie失効・ダウンロード失敗・整形失敗・BQロード失敗で LINE Notify に送信。

## 環境変数

`.env.example` に主要なキーを追記しています。主なもの:

- `LSTEP_LOGIN_URL`, `LSTEP_FRIENDS_URL` — Lstep ログイン/友だち一覧URL。
- `LSTEP_GCS_BUCKET`, `LSTEP_STORAGE_STATE_OBJECT` — Cookie保存先とオブジェクトキー。
- `LSTEP_BQ_*` — BigQuery プロジェクト・データセット・ロケーション。
- `LSTEP_RAW_PREFIX`, `LSTEP_PROCESSED_PREFIX` — GCS 配下のプレフィックス。
- `LSTEP_LINE_NOTIFY_TOKEN` — 通知用トークン。
- `LSTEP_RETRY_DELAYS_MS`, `LSTEP_DOWNLOAD_TIMEOUT_MS` — リトライ/タイムアウト設定。

## 手動セットアップ手順

1. `.env.local` に必要な Lstep / GCP / LINE の情報を記入。
2. `npm install` を実行して依存ライブラリ（Playwright 等）を取得。
3. `npm run lstep:capture` を実行し、開いたブラウザで reCAPTCHA を含めてログイン。ログイン完了後 Enter を押すと Cookie が `gs://<bucket>/<storage_state_object>` に保存される。
4. GCS バケットに対し、`raw/` プレフィックスへ 7 日 TTL のオブジェクトライフサイクルを設定。
5. Cloud Run サービスをデプロイし、環境変数を設定。Cloud Scheduler（01:00 JST）からサービスを起動。

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

詳細な SQL は開発メモ（前回共有）または `runLstepIngestion` 実装周辺を参照。

## 運用チェックリスト

- Cloud Run ログでダウンロード手順が完了し、BigQuery ロードジョブが成功しているか確認。
- `raw/` と `processed/` 配下に日付ディレクトリが生成されているか確認。
- LINE Notify がエラー時のみ送信されることをテスト。
- AutoStudio 側で BigQuery 接続設定（Service Account）と KPI クエリの準備。

## 今後の拡張ポイント

- Playwright フローのスクリーンショット保存やUI変更検知。
- 成功ジョブの軽量メトリクス蓄積（Logging → Monitoring）。
- AutoStudio 内タブナビゲーションを Threads/YouTube/Instagram と共通化。
- BigQuery でのマテビューや Looker Studio 連携。
