# YouTube Module Setup Guide

Follow these steps to ingest data and enable the AutoStudio YouTube dashboard.

## 1. Environment Variables
Add the following to `.env.local` (or Vercel environment) and restart the app:

```
YOUTUBE_API_KEY=your_data_api_key
YOUTUBE_CHANNEL_ID=UCxxxxxxxxxxxx
YOUTUBE_COMPETITOR_IDS=UCfapRkagDtoQEkGeyD3uERQ,UCCIPlDofGZVef3HArQBRrEw,UChxtIA33ty53Hh4MmkXNASg,UCbxNKPuL7G3M_Zjt03d2IYA,UC_kTlZMryHFPMc7QMi4g0VQ,UC8FwuifT73FtnO93ZUNSoLg,UCNjHT-PGWtoHAJzDbP_fKaA
YOUTUBE_BQ_DATASET_ID=autostudio_media

# Optional (required for Analytics sync)
YOUTUBE_OAUTH_CLIENT_ID=...
YOUTUBE_OAUTH_CLIENT_SECRET=...
YOUTUBE_OAUTH_REFRESH_TOKEN=...

# Notion integration
NOTION_API_TOKEN=secret_xxx
NOTION_CONTENT_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- `YOUTUBE_API_KEY`: Google Cloud API key with YouTube Data API v3 enabled.
- OAuth credentials: create an OAuth client (Desktop app) in Google Cloud → authorize your Google account with scopes `youtube.readonly` and `yt-analytics.readonly`, then capture the refresh token via `npm run youtube:oauth` (command to be added later).
- `YOUTUBE_BQ_DATASET_ID` defaults to `autostudio_media`. Change if you need a different dataset name.

## 2. BigQuery permissions
- Reuse the existing service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) with BigQuery access.
- Ensure the account has dataset create permission (it automatically creates `autostudio_media` on first run).

## 3. Notion database preparation
1. Create a new database named **AutoStudio Content Hub**.
2. Add the properties described in `docs/youtube-module-spec.md` (Media, Content Type, Status, AutoStudio ID, Target Persona, Theme Keyword, Source Videos, Generated At, Last Synced, Claude Template).
3. Share the database with the “AutoStudio” integration (Settings → My connections → Connect integrations).
4. Paste the database ID into `NOTION_CONTENT_DATABASE_ID` (ID is the 32‑character string in the database URL).
5. In Notion MCP, connect the same integration token if you want AI tools inside Notion.

## 4. Initial data ingestion
Run the sync script after setting env vars:

```
npm run youtube:sync
```

This will:
- create BigQuery tables (`media_channels_snapshot`, `media_videos_snapshot`, `media_metrics_daily`)
- fetch competitor channel/video data
- fetch your channel analytics (if OAuth env is set)

スケジュール実行のセットアップは後述の「日次バッチの自動化」を参照してください。

## 5. AutoStudio dashboard
- Start the app with `npm run dev` and open http://localhost:3000/youtube to view the dashboard.
- Hot themes are computed from the latest top videos; if no data appears, confirm the BigQuery tables contain records for today.

## 6. Notion sync test
疎通確認用に次のコマンドを実行します。

```
npm run notion:test
```

正常に終了すると Notion データベースに「テスト: AutoStudio 連携確認」というページが作成され、同じ ID で再実行すると更新になります。

## 7. Claude台本生成API
- `POST /api/youtube/scripts`
  - リクエスト例:
    ```json
    {
      "themeKeyword": "Flow と Veo3 の組み合わせ活用",
      "videoType": "B",
      "targetPersona": "月商1000万円を目指すマーケター",
      "notes": "Flowの導線設計を深掘りしたい"
    }
    ```
  - 生成された台本は BigQuery `media_content_scripts` に保存され、Notion にドラフトページが作成されます。
  - 応答JSONには scriptSections、LINE誘導キーワード、Notion ページIDが含まれます。

## 8. 日次バッチの自動化
- `deploy/youtube-sync/` に Cloud Run × Cloud Scheduler 用のテンプレートを追加。
  - `Dockerfile` : `npm run youtube:sync` を実行するコンテナ。
  - `cloudbuild.yaml` : コンテナビルドと Cloud Run へのデプロイ。
  - `scheduler-job.yaml` : JST 06:00 に Cloud Run サービスを起動するスケジュール設定例。
  - `env.yaml` : 必要環境変数の一覧（Secret Manager で管理する前提）。
- LSTEP モジュール同様に `gcloud builds submit` → `gcloud scheduler jobs create http` の流れで日次化できます。

## 9. 次の拡張アイデア
- `media_video_themes` を永続化し、テーマのスコア推移を可視化。
- Notion 側での編集内容を逆同期し、AutoStudio 内のステータス更新につなげる。
