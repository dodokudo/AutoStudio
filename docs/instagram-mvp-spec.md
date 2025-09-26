# Instagram 自動競合リサーチ & 台本生成ツール（AutoStudio ツール3）仕様（MVP）

## 目的

- Google Drive に集めた競合リールを自動で文字起こしし、伸びている傾向を抽出する。
- Claude で自社向けのリール台本（2 本）とストーリー用補助テキストを生成する。
- 毎朝メール通知で台本を受け取り、AutoStudio の `/instagram` タブでトレンドと自社実績を可視化する。

## 全体アーキテクチャ

```
Cloud Scheduler (毎日 09:00 JST)
  → Cloud Run (Node.js)
     1. fetchCompetitorReels.ts
        - Drive/GAS で保存された競合リールメタ情報を取得
        - Instagram Graph API Business Discovery + Insights を取得
        - BigQuery autostudio_instagram.competitor_reels_raw / _insights へ保存
     2. transcribeCompetitorReels.ts
        - Gemini Files API で動画を文字起こし
        - 要約のみ BigQuery autostudio_instagram.competitor_reels_transcripts に保存
     3. generateReelScripts.ts
        - Claude に競合要約 + 自社実績を渡し、台本案を 2 本生成
        - BigQuery autostudio_instagram.my_reels_scripts に保存
     4. notifyReelScripts.ts
        - 最新の生成結果をメールで送信（LINE Notify は後日対応）
```

UI フロー

- `/instagram`
  - 上部 KPI: 自社フォロワー推移・リール主要指標（ANALYCA 既存ロジックを転用）
  - 競合分析カード: 直近伸びているテーマ / CTA / 構成
  - 「今日の台本案」: Claude 生成の 2 本を表示（メイン台本 + ストーリー補助）
  - 競合設定セクション: ユーザー追加分のみ表示・編集

## BigQuery データセット

- データセット: `autostudio_instagram`（LOCATION: `asia-northeast1`）
- テーブル
  - `competitor_reels_raw`
    - `snapshot_date` DATE
    - `drive_file_id` STRING
    - `drive_file_url` STRING
    - `username` STRING
    - `instagram_media_id` STRING
    - `caption` STRING
    - `permalink` STRING
    - `media_type` STRING
    - `posted_at` TIMESTAMP
    - `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
  - `competitor_reels_insights`
    - `snapshot_date` DATE
    - `instagram_media_id` STRING
    - `views` INT64
    - `reach` INT64
    - `likes` INT64
    - `comments` INT64
    - `saves` INT64
    - `engagement` INT64
    - `avg_watch_time_sec` FLOAT64
    - `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
  - `competitor_reels_transcripts`
    - `snapshot_date` DATE
    - `instagram_media_id` STRING
    - `drive_file_id` STRING
    - `summary` STRING  -- 原文全文ではなく要約のみ
    - `key_points` ARRAY<STRING>
    - `hooks` ARRAY<STRING>
    - `cta_ideas` ARRAY<STRING>
    - `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
  - `my_reels_scripts`
    - `snapshot_date` DATE
    - `script_id` STRING
    - `title` STRING
    - `hook` STRING
    - `body` STRING
    - `cta` STRING
    - `story_text` STRING
    - `inspiration_sources` ARRAY<STRING>
    - `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
  - `instagram_competitors_private`
    - `username` STRING
    - `drive_folder_id` STRING
    - `category` STRING
    - `active` BOOL
  - `user_competitor_preferences`
    - `user_id` STRING
    - `username` STRING
    - `drive_folder_id` STRING
    - `category` STRING
    - `priority` INT64
    - `active` BOOL
    - `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP()

## 環境変数

| 変数名 | 用途 |
| --- | --- |
| `IG_COMPETITOR_DRIVE_FOLDER_ID` | 競合リールを保存する Drive フォルダ ID（複数の場合はカンマ区切り想定） |
| `GEMINI_API_KEY` | Gemini 1.5 Pro API キー |
| `CLAUDE_API_KEY` | Claude API キー |
| `CLAUDE_MODEL_INSTAGRAM` | 台本生成用 Claude モデル（既定: `claude-3-5-sonnet-20241022`） |
| `IG_EMAIL_TO` | 台本納品メールの宛先（カンマ区切り可） |
| `IG_EMAIL_FROM` | 送信元メールアドレス |
| `IG_SMTP_HOST` / `IG_SMTP_PORT` / `IG_SMTP_USER` / `IG_SMTP_PASS` | SMTP 設定（既存 LSTEP 設定を再利用可） |
| `IG_BQ_PROJECT_ID` | BigQuery プロジェクト ID（未設定時は `BQ_PROJECT_ID` を使用） |
| `IG_BQ_DATASET` | BigQuery データセット名（既定: `autostudio_instagram`） |
| `IG_GCP_LOCATION` | BigQuery / GCS ロケーション |
| `IG_THREADS_ACCOUNT_ID` | Threads API で自社投稿実績を取得する際に利用（ANALYCA から転用） |
| `IG_THREADS_TOKEN` | Threads API トークン |

## 処理ステップ詳細

### 1. 競合リール収集 (`src/scripts/instagram/fetchCompetitorReels.ts`)
- 内部テーブル `instagram_competitors_private` + ユーザー設定 `user_competitor_preferences` から監視リストを構築。
- Drive REST API or Google Drive SDK で対象フォルダの新規動画を検知。
- 初回は Drive ファイル ID / URL / ファイル名 / タイムスタンプを BigQuery `competitor_reels_raw` に書き込み。
- Instagram Business Discovery API で競合の最新投稿を取得し、Insights API を併走させて `competitor_reels_insights` を更新。

### 2. 文字起こし (`src/scripts/instagram/transcribeCompetitorReels.ts`)
- Drive ファイル ID ごとに Gemini Files API へアップロード、`generateContent` で短い要約・キーポイントのみ抽出。
- 文字起こし本文は保存せず、要約と構造的な指標のみ BigQuery へ書き込み。
- 失敗時はメールで通知し、次回ジョブで再試行できるようステータス管理を追加予定。

### 3. 台本生成 (`src/scripts/instagram/generateReelScripts.ts`)
- 直近 7 日以内の競合要約と自社 `instagram_reels` インサイト（ANALYCA ロジック）をまとめて Claude へ投げる。
- 出力フォーマット（JSON）を定義し、メイン台本 2 本 + ストーリー補助テキストを生成。
- `my_reels_scripts` に保存し、既存日の台本は上書き or バージョン管理（`script_id` を UUID に）する。

### 4. 通知 (`src/scripts/instagram/notifyReelScripts.ts`)
- 最新 `my_reels_scripts` から 2 本分を取得し、メールテンプレートに整形。
- Nodemailer で送信。後日 LINE Notify へ切り替え予定。

## UI 要件

- `/instagram` ルートを新設。`navigation-tabs.tsx` の Instagram タブを有効化。
- 初期表示
  - フォロワー推移チャート（ANALYCA から流用）
  - 競合トレンド（タグ / フック / CTA ランキング）
  - 今日の台本 2 本（タイトル・Hook・CTA・ストーリー案）
- 競合設定の UI はユーザー追加分のみ表示し、内部デフォルトは隠す。
- ダークモード対応（既存スタイルを踏襲）。

## 今後の拡張

- LINE Notify での配信（メールと二重 delivery）
- コンテンツ投稿自動化（Threads / Instagram API を利用）
- ハッシュタグ検索・UGC 取得による追加分析
- 台本評価フィードバックループの導入（投稿結果→台本改善）

