# Launch Dashboard + LINE配信計測 — 全体設計書

## 概要

AutoStudioに「Launch」タブを追加し、ローンチ/エバーグリーンの全数字を一元管理する。
LINE配信の開封率・クリック率を自動計測し、ファネルビルダーの配信UI（コンテンツ）と
Lステップの実績データ（メトリクス）を統合表示する。

### 役割分離
- **ファネルビルダー** = 設計ツール（LP設計、配信設計、ファネル構築）
- **AutoStudio** = 分析ツール（結果閲覧、ダッシュボード、KPI管理）
- **BigQuery** = データハブ（両者を繋ぐ）

---

## Phase 1: Lステップ配信メトリクス自動取得

### 1.1 目的
Lステップ管理画面から一斉配信の開封率・URL計測のクリック率を自動スクレイピングし、
時系列でBigQueryに蓄積する。

### 1.2 データソース（スクレイピング対象）

| ページ | URL | 取得データ |
|--------|-----|-----------|
| 一斉配信一覧 | `/line/magazine` | 配信名、配信日時、開封数、開封率、配信数 |
| 配信送信ログ | `/line/magazine/sendlogs/{id}` | 配信先人数、送信成功数 |
| URL計測詳細 | `/line/site/show/{id}` | 総クリック数、訪問人数、クリック率 |

#### スクレイピング仕様
- `/line/magazine` テーブル構造:
  - セルindex 6: 開封数 — フォーマット `219（28.3%）`、正規表現 `(\d+)（([\d.]+)%）`
  - セルindex 7: 配信数（`/magazine/sendlogs/{id}` へのリンクあり → IDを抽出）
  - 開封数セル内の「更新」ボタンをクリックして最新値を取得してからスクレイプ
- `/line/site/show/{id}`:
  - 総クリック数、訪問人数、クリック率をテーブルから取得

### 1.3 BigQueryテーブル設計

**データセット**: `autostudio_lstep`（既存）

#### `broadcast_metrics` — 一斉配信の時系列メトリクス
```sql
CREATE TABLE IF NOT EXISTS `{project}.{dataset}.broadcast_metrics` (
  measured_at      TIMESTAMP NOT NULL,  -- 計測日時
  broadcast_id     STRING NOT NULL,     -- sendlogs URLから抽出したID
  broadcast_name   STRING,              -- 配信名
  sent_at          STRING,              -- 配信日時（テーブルから取得した文字列）
  delivery_count   INT64,               -- 配信数
  open_count       INT64,               -- 開封数
  open_rate        FLOAT64,             -- 開封率（%）
  elapsed_minutes  INT64                -- 配信からの経過分数
)
PARTITION BY DATE(measured_at)
CLUSTER BY broadcast_id;
```

#### `url_click_metrics` — URLクリックの時系列メトリクス
```sql
CREATE TABLE IF NOT EXISTS `{project}.{dataset}.url_click_metrics` (
  measured_at      TIMESTAMP NOT NULL,
  url_id           STRING NOT NULL,     -- URL計測ID（/line/site/show/{id}）
  url_name         STRING,              -- URL計測名
  total_clicks     INT64,               -- 総クリック数
  unique_visitors  INT64,               -- 訪問人数
  click_rate       FLOAT64,             -- クリック率（%）
  elapsed_minutes  INT64                -- 紐づく配信からの経過分数
)
PARTITION BY DATE(measured_at)
CLUSTER BY url_id;
```

#### `measurement_schedule` — 計測スケジュール管理
```sql
CREATE TABLE IF NOT EXISTS `{project}.{dataset}.measurement_schedule` (
  id               STRING NOT NULL,     -- スケジュールID
  broadcast_id     STRING NOT NULL,     -- 対象配信ID
  broadcast_name   STRING,              -- 配信名
  sent_at          TIMESTAMP,           -- 配信日時
  measure_at       TIMESTAMP NOT NULL,  -- 計測予定日時
  elapsed_minutes  INT64 NOT NULL,      -- 配信からの経過分数
  status           STRING NOT NULL,     -- pending | completed | failed
  completed_at     TIMESTAMP,
  error_message    STRING
)
PARTITION BY DATE(measure_at)
CLUSTER BY broadcast_id, status;
```

### 1.4 計測スケジュール

配信検出後、以下のタイミングで計測を自動スケジューリング:

| ポイント | 経過時間 | elapsed_minutes | 目的 |
|----------|----------|-----------------|------|
| T1 | 30分後 | 30 | 初動（プッシュ通知反応） |
| T2 | 1時間後 | 60 | 短期反応 |
| T3 | 12時間後 | 720 | 半日累積 |
| T4 | 24時間後 | 1440 | 1日後最終値 |
| T5 | 2日目 朝9時 | -- | 長期推移 |
| T6 | 2日目 夜21時 | -- | 長期推移 |
| T7 | 3日目 朝9時 | -- | 長期推移 |
| T8 | 3日目 夜21時 | -- | 長期推移 |
| T9 | 4日目 朝9時 | -- | 長期推移 |
| T10 | 4日目 夜21時 | -- | 長期推移 |
| T11 | 5日目 朝9時 | -- | 長期推移 |
| T12 | 5日目 夜21時 | -- | 最終計測 |

※ T5-T12は配信日時からの絶対時刻で計算

### 1.5 実行アーキテクチャ

```
Cloud Scheduler (*/15 * * * *) — 15分おき
    ↓
Cloud Run ジョブ: autostudio-lstep-metrics
    ├─ Step 1: 新規配信検出
    │    /line/magazine をスクレイプ
    │    既存のbroadcast_metricsにないbroadcast_idを検出
    │    measurement_scheduleに12ポイント分のレコードをINSERT
    │
    ├─ Step 2: 計測スケジュール消化
    │    measurement_scheduleから status=pending AND measure_at <= NOW() を取得
    │    各配信の開封数を更新ボタンクリック→スクレイプ
    │    URL計測をスクレイプ
    │    broadcast_metrics / url_click_metrics にINSERT
    │    measurement_scheduleの status を completed に更新
    │
    └─ Step 3: Cookie更新
         使用したstorageStateをGCSに保存（既存パイプラインと共有）
```

### 1.6 新規ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/lstep/messageScraper.ts` | Playwright: /line/magazine, /line/site スクレイピング |
| `src/lib/lstep/messageTypes.ts` | 型定義: BroadcastMetric, UrlClickMetric, MeasurementSchedule |
| `src/lib/lstep/messageScheduler.ts` | 計測スケジュール生成・消化ロジック |
| `src/scripts/runMessageMetrics.ts` | パイプラインオーケストレーション |
| `src/scripts/initMessageMetricsBQ.ts` | BigQueryテーブル初期化 |

### 1.7 既存コードとの関係
- `downloader.ts` の Playwright起動パターン（Cookie取得、ブラウザ起動、ログインチェック）を再利用
- `config.ts` の LstepConfig を拡張（新規環境変数は不要、既存のGCS/BQ設定を共用）
- `errors.ts` のエラークラスを共用
- `gcs.ts` のアップロード/ダウンロードを共用
- Cookie（storageState）は既存パイプラインと同一ファイルを共用

---

## Phase 2: AutoStudio「Launch」タブ — ファネル一覧

### 2.1 ナビゲーション追加

`navigation-tabs.tsx` に追加:
```typescript
{ id: 'launch', href: '/launch', label: 'Launch' }
// LINEとSalesの間に配置
```

### 2.2 ページ構造

```
/launch                          ← ローンチ一覧
/launch/[funnelId]               ← ローンチ詳細
```

### 2.3 ローンチ一覧

ファネルビルダーのBigQuery（`marketing.funnels`）からファネル一覧を取得し表示。

| カラム | 内容 |
|--------|------|
| ファネル名 | funnel.name |
| 期間 | startDate 〜 endDate |
| ステータス | 準備中 / 実施中 / 完了 / エバー |
| 配信数 | deliveries.length |
| 主要KPI | 開封率平均、クリック率平均（broadcast_metricsから集計） |

### 2.4 データ取得

ファネルビルダーと同じBigQueryプロジェクト（`mark-454114`）なので、
AutoStudio側から直接 `marketing.funnels` テーブルを読める。

```typescript
// ファネルデータ取得
const [funnels] = await bq.query(`
  SELECT id, JSON_VALUE(data, '$.name') as name,
         JSON_VALUE(data, '$.startDate') as start_date,
         JSON_VALUE(data, '$.endDate') as end_date,
         JSON_QUERY(data, '$.deliveries') as deliveries_json
  FROM \`mark-454114.marketing.funnels\`
  ORDER BY updated_at DESC
`);
```

---

## Phase 3: ローンチ詳細 — ファネルフロー + 配信一覧

### 3.1 コンポーネント移植（ファネルビルダー → AutoStudio）

以下のコンポーネントをAutoStudioに移植（読み取り専用版）:

| コンポーネント | 移植元 | 用途 |
|---------------|--------|------|
| `LineMessageRenderer` | funnel/src/components/ | LINEメッセージプレビュー |
| `FunnelFlowView`（簡易版） | funnel/src/components/ | ファネルフロー図 |
| 型定義 | funnel/src/types/funnel.ts | DeliveryItem, LineMessage等 |

### 3.2 ローンチ詳細ページ構成

```
/launch/[funnelId]
├─ ① ファネルフロー図
│    日付×セグメントのグリッド表示
│    各ノードにメトリクスバッジ: 開封率 / クリック率
│    色分け: 緑(>40%) / 黄(20-40%) / 赤(<20%)
│
├─ ② 配信一覧テーブル
│    配信名 | 日時 | 配信数 | 開封率 | クリック率 | 推移スパーク
│    クリックで詳細展開
│
└─ ③ 配信詳細（展開時）
     左: LINEメッセージプレビュー（LineMessageRenderer）
     右: 時系列チャート（Rechartsの折れ線グラフ）
          X軸: 経過時間（30m, 1h, 12h, 24h, 2d, ...5d）
          Y軸: 開封率（%）、クリック率（%）
```

### 3.3 配信コンテンツとメトリクスの紐づけ

ファネルビルダーの `DeliveryItem.title` と Lステップの `broadcast_name` をマッチング:

```typescript
// Step 1: ファネルのdeliveriesからLINE配信を抽出
const lineDeliveries = funnel.deliveries.filter(d => d.type === 'message' && d.messages?.length);

// Step 2: broadcast_metricsから最新メトリクスを取得
const metrics = await getBroadcastMetrics(funnelStartDate, funnelEndDate);

// Step 3: 配信名でマッチング（部分一致）
for (const delivery of lineDeliveries) {
  delivery._metrics = metrics.find(m =>
    m.broadcast_name.includes(delivery.title) ||
    delivery.title.includes(m.broadcast_name)
  );
}
```

---

## Phase 4: LINE配信詳細 + 時系列チャート

### 4.1 配信詳細ビュー

配信をクリックすると展開:

```
┌─────────────────────────────────────────────────────┐
│ 配信詳細: Day1 教育①「結論から言います」             │
├─────────────────────┬───────────────────────────────┤
│                     │ 開封率推移                     │
│  [LINE UI]          │  ┌──────────────────────┐     │
│  ┌────────┐        │  │    ╱─────────────     │     │
│  │通知テキスト│     │  │   ╱              28.3%│     │
│  │ xxxxxxxx │      │  │  ╱                    │     │
│  │ xxxxxxxx │      │  │ ╱                     │     │
│  └────────┘        │  └──────────────────────┘     │
│  ┌────────┐        │  30m  1h  12h  24h  2d  5d    │
│  │本文     │       │                                │
│  │ xxxxxxxx│       │ クリック率推移                   │
│  │ xxxxxxxx│       │  ┌──────────────────────┐     │
│  └────────┘        │  │   ╱───────── 12.1%   │     │
│                     │  └──────────────────────┘     │
│  配信数: 774        │                                │
│  開封数: 219        │ URL計測                        │
│  開封率: 28.3%      │  リンクA: 94クリック (12.1%)    │
│                     │  リンクB: 52クリック (6.7%)     │
├─────────────────────┴───────────────────────────────┤
│ バージョン履歴 (Phase 6で実装)                        │
│  v1 (3/8配信): 開封率 22.1% → v2 (3/15配信): 28.3%  │
│  改善: +6.2pt                                        │
└─────────────────────────────────────────────────────┘
```

### 4.2 APIルート（AutoStudio側）

| ルート | メソッド | 用途 |
|--------|---------|------|
| `/api/launch/funnels` | GET | ファネル一覧（marketing.funnelsから） |
| `/api/launch/funnels/[id]` | GET | ファネル詳細 + 配信データ |
| `/api/launch/broadcasts` | GET | 配信メトリクス一覧（期間指定） |
| `/api/launch/broadcasts/[id]` | GET | 配信メトリクス時系列 |
| `/api/launch/broadcasts/[id]/urls` | GET | 紐づくURL計測メトリクス |

---

## Phase 5: LP計測連携

### 5.1 LP CVR取得
- Lステップの回答フォーム（申込フォーム）の回答数 = CV数
- URL計測の訪問人数 = LP訪問数
- CVR = CV数 / LP訪問数

### 5.2 表示
ローンチ詳細のサマリーセクションに:
- LP URL
- 訪問数（URL計測から）
- CV数（回答フォーム or タグ付与数から）
- CVR

---

## Phase 6: A/Bバージョン管理

### 6.1 データ構造

ファネルビルダーのDeliveryItemに追加:
```typescript
interface DeliveryItem {
  // ...既存フィールド
  version?: number;                // バージョン番号（1, 2, 3...）
  previousVersionId?: string;      // 前バージョンの配信ID
  versionNote?: string;            // 変更メモ（「通知テキスト変更」等）
}
```

### 6.2 比較ロジック

同じファネル位置（date × segmentIds）の旧版 vs 新版:
- broadcast_metricsから両バージョンの24時間後メトリクスを取得
- 開封率の差分、クリック率の差分を算出
- ダッシュボードに `+6.2pt` のようなデルタ表示

---

## Phase 7: エバーグリーン対応 + Cloud Run自動化

### 7.1 エバーグリーン

ファネルのステータスが「エバー」の場合:
- シナリオ配信の日次メトリクスを計測
- 新規友だちがシナリオに入るたびに、そのコホートの開封率を追跡
- 週次・月次サマリーを自動生成

### 7.2 Cloud Run デプロイ

既存の `deploy/lstep/` を拡張:

```
deploy/lstep-metrics/
├── Dockerfile           ← 既存Dockerfileベース、エントリーポイント変更
├── cloudbuild.yaml
├── scheduler-job.yaml   ← */15 * * * * (15分おき)
└── env.yaml
```

同一のGCSバケット・Cookie・BigQueryデータセットを共用。
既存の01:00友だちCSVジョブとは別のCloud Runサービスとして独立稼働。

---

## 実装順序

| Phase | 内容 | 依存 |
|-------|------|------|
| **1a** | 型定義 + BigQueryテーブル初期化スクリプト | なし |
| **1b** | messageScraper.ts — /line/magazine スクレイピング | 1a |
| **1c** | messageScheduler.ts — 計測スケジュール管理 | 1a |
| **1d** | runMessageMetrics.ts — パイプライン統合 | 1b, 1c |
| **1e** | ローカルテスト（手動実行で数値取得確認） | 1d |
| **2** | Launchタブ + ファネル一覧UI | 1a（データなくてもUI先行可） |
| **3** | ローンチ詳細 — フロー図 + 配信一覧 | 2 |
| **4** | 配信詳細 — LINEプレビュー + チャート | 3, 1e |
| **5** | LP計測連携 | 4 |
| **6** | A/Bバージョン管理 | 4 |
| **7** | Cloud Run 15分ジョブ + エバー対応 | 1d |

---

## 環境変数（追加不要）

既存の `LSTEP_*` 環境変数をそのまま使用:
- `LSTEP_GCS_BUCKET` — Cookie保存先（共用）
- `LSTEP_STORAGE_STATE_OBJECT` — Cookie（共用）
- `LSTEP_BQ_PROJECT_ID` / `LSTEP_BQ_DATASET` — BigQuery（共用）

ファネルビルダーのデータ読み取り:
- `BQ_PROJECT_ID` = `mark-454114`（既存）
- テーブル: `marketing.funnels`（直接クエリ）
